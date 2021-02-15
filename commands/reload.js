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
    name: "reload",
    aliases: ["rl"],
    usage: "<command here>",
    args: 1,
	isExternal: false,
    adminOnly: true,
    description: "Reloads a command.",
    execute(message, args) {
        const commandName = args[0].toLowerCase();
        const command = message.client.commands.get(commandName)
            || message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 command not found.")
                .setDescription("It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        delete require.cache[require.resolve(`./${command.name}.js`)];
        try {
            const newCommand = require(`./${command.name}.js`);
            message.client.commands.set(newCommand.name, newCommand);

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#03fc24")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully reloaded command ${newCommand.name}!`)
                .setDescription("Command updated.")
                .setTimestamp();
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
        catch (error) {
            console.log(error);
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, failed to reload command.")
                .setDescription(`Something must have gone wrong. Please report this issue to the devs. \n\`${error}\``)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
    }
}