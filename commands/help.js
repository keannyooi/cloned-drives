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
const prefix = process.env.PREFIX;
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "help",
    usage: "<command name goes here>",
    args: 0,
	category: "Info",
    description: "...wait, what are you doing here?",
    execute(message, args) {
        const { commands } = message.client;
        const adminCommands = [], cmCommands = [], miscCommands = [], configCommands = [], gameplayCommands = [], infoCommands = [];
        commands.forEach(function(command) {
            switch (command.category) {
                case "Admin":
                    adminCommands.push(`\`${command.name}\``);
                    break;
                case "Community Management":
                    cmCommands.push(`\`${command.name}\``);
                    break;
                case "Gameplay":
                    gameplayCommands.push(`\`${command.name}\``);
                    break;
                case "Info":
                    infoCommands.push(`\`${command.name}\``);
                    break;
                case "Configuration":
                    configCommands.push(`\`${command.name}\``);
                    break;
                case "Miscellaneous":
                    miscCommands.push(`\`${command.name}\``);
                    break;
                default:
                    break;
            }
        });

        if (!args.length || !isNaN(args[0])) {
            let infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Cloned Drives Commands")
                .setDescription("Use `cd-help <command name>` to learn more about a specific command.")
                .addFields(
                    { name: "Info", value: infoCommands.join(", ") },
                    { name: "Gameplay", value: gameplayCommands.join(", ") },
                    { name: "Configuration", value: configCommands.join(", ") },
                    { name: "Miscellaneous", value: miscCommands.join(", ") }
                )
                .setTimestamp();
            if (message.member.roles.cache.has("802043346951340064")) {
                infoScreen.addField("Community Management", cmCommands.join(", "));
            }
            if (message.member.roles.cache.has("711790752853655563")) {
                infoScreen.addField("Admin", adminCommands.join(", "));
            }

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
        else {
            const name = args[0].toLowerCase();
            const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

            if (!command) {
                let commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
                let matches = stringSimilarity.findBestMatch(name, commandFiles.map(i => i.slice(0, -3)));
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, 404 command not found.")
                    .setDescription("It looks like this command doesn't exist. Try referring to the command list.")
                    .addField("Keywords Received", `\`${name}\``, true)
                    .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            if (command.category === "Admin" && !message.member.roles.cache.has("711790752853655563")) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, you may not view info about this command.")
                    .setDescription("You don't have the <@&711790752853655563> role, which is required to view this command.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            if (command.category === "Community Management" && !message.member.roles.cache.has("802043346951340064")) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, you may not view info about this command.")
                    .setDescription("You don't have the <@&802043346951340064> role, which is required to view this command.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }

            let aliases = "None";
            if (command.aliases) {
                aliases = command.aliases.join(", ");
            }
			
			let cooldown = 1;
			if (command.cooldown) {
				cooldown = command.cooldown;
			}

            let syntax = "";
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
                    { name: "Aliases", value: aliases, inline: true },
                    { name: "Category", value: command.category, inline: true },
					{ name: "Cooldown", value: `${cooldown} second(s)`, inline: true },
                    { name: "Syntax", value: syntax },
                    { name: "Description", value: command.description }
                )
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
    }
}