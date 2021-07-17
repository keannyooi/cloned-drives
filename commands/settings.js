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
    name: "settings",
    usage: "<(optional) name of deck>",
    args: 0,
    category: "Configuration",
    description: "Configure settings here.",
    async execute(message, args) {
        const db = message.client.db;
        const settings = await db.get(`acc${message.author.id}.settings`);

        if (!args[0]) {
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Your Settings")
                .addFields(
                    { name: "Enable Graphics (ID: \`enablegraphics\`)", value: `Having this set to \`false\` skips through all bot-generated graphics. Perfect for faster loading times.\n**Value:** \`${settings.enablegraphics}\``, inline: true },
                    { name: "Enable Daily Reward Notifications (ID: \`senddailynotifs\`)", value: `Having this set to \`true\` enables automated DM notifications when your daily reward can be claimed.\n**Value:** \`${settings.senddailynotifs}\``, inline: true },
                    { name: "Enable Car List Filtering (ID: \`filtercarlist\`)", value: `Having this set to \`true\` applies your current filter to the car list.\n**Value:** \`${settings.filtercarlist}\``, inline: true },
                    { name: "Enable Garage Filtering (ID: \`filtergarage\`)", value: `Having this set to \`true\` applies your current filter to the garage.\n**Value:** \`${settings.filtergarage}\``, inline: true },
                    { name: "Show Black Market Cars (ID: \`showbmcars\`)", value: `(This is WIP, doesn't do anything currently)\n**Value:** \`${settings.showbmcars}\``, inline: true }
                )
                .setTimestamp();
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
        else {
            let infoScreen;
            const setting = args[0].toLowerCase();
            switch (setting) {
                case "enablegraphics":
                case "senddailynotifs":
                case "filtercarlist":
                case "filtergarage":
                case "showbmcars":
                    if (!args[1]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument not provided.")
                            .setDescription("You are expected to provide a boolean value after the setting name.")
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    if (args[1].toLowerCase() === "true" || args[1].toLowerCase() === "false") {
                        if (setting === "senddailynotifs") {
                            message.author.send("You have activated daily reward notifications! Notifications will be sent here.")
                                .catch(() => {
                                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                    let errorMessage = new Discord.MessageEmbed()
                                        .setColor("#fc0303")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                        .setTitle("Error, it looks like I am unable to DM you.")
                                        .setDescription("This notification system requires the bot to have access to your DMs.")
                                        .setTimestamp();
                                    return message.channel.send(errorMessage);
                                });
                        }

                        settings[setting] = JSON.parse(args[1].toLowerCase());
                        infoScreen = new Discord.MessageEmbed()
                            .setColor("#03fc24")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully set the \`${setting}\` setting to \`${args[1].toLowerCase()}\`!`)
                            .setTimestamp();
                    }
                    else {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument provided is not a boolean.")
                            .setDescription("Booleans only have 2 states, true or false.")
                            .addField("Argument Received", `\`${args[1].toLowerCase()}\` (not a boolean)`)
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    break;
                default:
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const errorScreen = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Error, criteria selected not found.")
                        .setDescription(`Here is a list of setting criterias. 
									\`enablegraphics\` - Enable bot-generated graphics. Provide a boolean (\`true\` or \`false\`) after that.
                                    \`senddailynotifs\` - Enable automated daily reward notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                                    \`filtercarlist\` - Enable cd-carlist filtering. Provide a boolean (\`true\` or \`false\`) after that.
                                    \`filtergarage\` - Enable garage filtering. Provide a boolean (\`true\` or \`false\`) after that.
                                    \`showbmcars\` - Enable black market car visibility. Provide a boolean (\`true\` or \`false\`) after that.`)
                        .setTimestamp();
                    return message.channel.send(errorScreen);
            }

            await db.set(`acc${message.author.id}.settings`, settings);
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
    }
}