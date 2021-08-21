/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const fs = require("fs");
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const { ErrorMessage, SuccessMessage, sendMessage } = require("./sharedfiles/primary.js");

module.exports = {
    name: "reload",
    aliases: ["rl"],
    usage: "<command here>",
    args: 1,
	category: "Admin",
    description: "Reloads a command.",
    execute(message, args) {
        const commandName = args[0].toLowerCase();
        const command = message.client.commands.get(commandName)
            || message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) {
            const errorMessage = new ErrorMessage(
                "404 command not found.",
                "It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.",
                commandName,
                commandFiles.map(i => i.slice(0, -3))
            )
            return sendMessage(message, errorMessage.create(message));
        }

        delete require.cache[require.resolve(`./${command.name}.js`)];
        try {
            const newCommand = require(`./${command.name}.js`);
            message.client.commands.set(newCommand.name, newCommand);

            const successMessage = new SuccessMessage(
                `reloaded the \`${newCommand.name}\` command`,
                "The command is now up to date.",
            )
            return sendMessage(message, successMessage.create(message));
        }
        catch (error) {
            console.log(error);
            const errorMessage = new ErrorMessage(
                "failed to reload command.",
                `Something must have gone wrong. Please report this issue to the devs. \n\`${error.stack}\``,
            )
            return sendMessage(message, errorMessage.create(message));
        }
    }
}