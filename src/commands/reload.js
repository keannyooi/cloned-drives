"use strict";

const bot = require("../config/config.js");
const { readdirSync } = require("fs");
const commandFiles = readdirSync("./src/commands").filter(file => file.endsWith(".js"));
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "reload",
    aliases: ["rl"],
    usage: ["<command name/alias>"],
    args: 1,
    category: "Admin",
    description: "Reloads a command.",
    execute(message, args) {
        const commandName = args[0].toLowerCase();
        const command = bot.commands.get(commandName) || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, 404 command not found.",
                desc: "It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.",
                author: message.author
            }).displayClosest(commandName, commandFiles.map(i => i.slice(0, -3)));
            return errorMessage.sendMessage();
        }
        delete require.cache[require.resolve(`./${command.name}.js`)];

        try {
            const updatedCommand = require(`./${command.name}.js`);
            bot.commands.set(updatedCommand.name, updatedCommand);
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully reloaded the \`${updatedCommand.name}\` command!`,
                desc: "The command is now up to date.",
                author: message.author
            });
            return successMessage.sendMessage();
        }
        catch (error) {
            console.log(error);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, failed to reload command.",
                desc: `Something must have gone wrong. Please report this issue to the devs. \n\`${error.stack}\``,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
    }
};