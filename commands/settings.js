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
                    { name: "Show Black Market Cars (ID: \`showbmcars\`)", value: `(This is WIP, doesn't do anything currently)\n**Value:** \`${settings.showbmcars}\``, inline: true },
                    { name: "Sorting Order For List Filtering (ID: \`sortingorder\`)", value: `Lets you choose to sort either by ascending or descending. Affects the following commands: \`cd-garage, cd-carlist, cd-tracklist\`\n**Value:** \`${settings.sortingorder}\``, inline: true },
                    { name: "Unit Preference (ID: \`unitpreference\`)", value: `Lets you choose the unit system of your preference. Graphics aren't affected by this setting. The game uses British units by default.\n**Value:** \`${settings.unitpreference}\``, inline: true },
                    { name: "Button Style (ID: \`buttonstyle\`)", value: `Lets you choose the button style of your preference. \n**Value:** \`${settings.buttonstyle}\``, inline: true },
                    { name: "Shortened Lists (ID: \`shortenedlists\`)", value: `Saves at least 450 characters from lists, allowing longer lists to be shown. Affects the following commands: \`cd-garage, cd-carlist\`\n**Value:** \`${settings.shortenedlists}\``, inline: true }
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
                case "shortenedlists":
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
                case "unitpreference":
                    if (!args[1]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument not provided.")
                            .setDescription("You are expected to provide a unit system after the setting name. Here are the unit systems available: `british`, `metric` (SI), `imperial` (US)")
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    if (args[1].toLowerCase() === "british" || args[1].toLowerCase() === "imperial" || args[1].toLowerCase() === "metric") {
                        settings[setting] = args[1].toLowerCase();
                        infoScreen = new Discord.MessageEmbed()
                            .setColor("#03fc24")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully set your unit system of choice to the \`${args[1].toLowerCase()}\` system!`)
                            .setTimestamp();
                    }
                    else {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument provided is not a valid unit system.")
                            .setDescription("This game supports `british`, `imperial` (US) and `metric` (SI) unit systems only.")
                            .addField("Argument Received", `\`${args[1].toLowerCase()}\``)
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    break;
                case "sortingorder":
                    if (!args[1]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument not provided.")
                            .setDescription("You are expected to provide either `ascending` or `descending` after the setting name.")
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    if (args[1].toLowerCase() === "ascending" || args[1].toLowerCase() === "descending") {
                        settings[setting] = args[1].toLowerCase();
                        infoScreen = new Discord.MessageEmbed()
                            .setColor("#03fc24")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully set the sorting order to \`${args[1].toLowerCase()}\`!`)
                            .setTimestamp();
                    }
                    else {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument provided is invalid")
                            .setDescription("You are expected to provide either `ascending` or `descending`.")
                            .addField("Argument Received", `\`${args[1].toLowerCase()}\``)
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    break;
                case "buttonstyle":
                    if (!args[1]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument not provided.")
                            .setDescription("There are 2 styles to choose from: `default` and `classic`.")
                            .setTimestamp();
                        return message.channel.send(errorMessage);
                    }
                    if (args[1].toLowerCase() === "default" || args[1].toLowerCase() === "classic") {
                        settings[setting] = args[1].toLowerCase();
                        infoScreen = new Discord.MessageEmbed()
                            .setColor("#03fc24")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully set the button style to \`${args[1].toLowerCase()}\`!`)
                            .setTimestamp();
                    }
                    else {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        let errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, argument provided is invalid")
                            .setDescription("There are 2 styles to choose from: `default` and `classic`.")
                            .addField("Argument Received", `\`${args[1].toLowerCase()}\``)
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
                                    \`showbmcars\` - Enable black market car visibility. Provide a boolean (\`true\` or \`false\`) after that.
                                    \`unitpreference\` - Choose a unit system of your liking. Provide a the name of a unit system (\`british\`, \`imperial\` or \`metric\`) after that.
                                    \`sortingorder\` - Choose the order that items are sorted in. Provide either \`ascending\` or \`descending\` after that.
                                    \`buttonstyle\` - Choose the order that items are sorted in. Provide either \`default\` or \`classic\` after that.
                                    \`shortenedlists\` - Enable shortened lists in \`cd-garage\` and \`cd-carlist\`. Provide a boolean (\`true\` or \`false\`) after that.`)
                        .setTimestamp();
                    return message.channel.send(errorScreen);
            }

            await db.set(`acc${message.author.id}.settings`, settings);
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return message.channel.send(infoScreen);
        }
    }
}