"use strict";
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
    name: "endevent",
    aliases: ["removeevent", "rmvevent"],
    usage: "<event name goes here>",
    args: 1,
    category: "Events",
    description: "Ends an ongoing event.",
    async execute(message, args) {
        const db = message.client.db;
        const filter = response => {
            return response.author.id === message.author.id;
        };
        const events = await db.get("events");
        let eventName = args.join(" ").toLowerCase();
        const searchResults = Object.values(events).filter(event => {
            if (typeof event === "object") {
                return event.name.toLowerCase().includes(eventName);
            }
            else {
                return false;
            }
        });
        if (searchResults.length > 1) {
            let eventList = "";
            for (i = 1; i <= searchResults.length; i++) {
                eventList += `${i} - ${searchResults[i - 1].name} \n`;
            }
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple events found, please type one of the following.")
                .setDescription(eventList)
                .setTimestamp();
            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
                    errors: ["time"]
                })
                    .then(collected => {
                    collected.first().delete();
                    if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length || parseInt(collected.first().content) < 1) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Error, invalid integer provided.")
                            .setDescription("It looks like your response was either not a number or not part of the selection.")
                            .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                            .setTimestamp();
                        return currentMessage.edit(errorMessage);
                    }
                    else {
                        endEvent(searchResults[parseInt(collected.first()) - 1], currentMessage);
                    }
                })
                    .catch(() => {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
            endEvent(searchResults[0]);
        }
        else {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 event not found.")
                .setDescription("Try checking again using `cd-events`.")
                .addField("Keywords Received", `\`${eventName.join(" ")}\``)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        async function endEvent(event, currentMessage) {
            const settings = await db.get(`acc${message.author.id}.settings`);
            const buttonFilter = (button) => {
                return button.clicker.user.id === message.author.id;
            };
            let yse, nop;
            if (settings.buttonstyle === "classic") {
                yse = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("✅")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("❎")
                    .setID("nop");
            }
            else {
                yse = new disbut.MessageButton()
                    .setStyle("green")
                    .setLabel("Yes!")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("red")
                    .setLabel("No!")
                    .setID("nop");
            }
            let row = new disbut.MessageActionRow().addComponents(yse, nop);
            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to end the ${event.name} event?`)
                .setTimestamp();
            let reactionMessage, processed = false;
            if (currentMessage) {
                reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
            }
            else {
                reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
            }
            const collector = reactionMessage.createButtonCollector(buttonFilter, { time: 10000 });
            collector.on("collect", async (button) => {
                if (!processed) {
                    processed = true;
                    switch (button.id) {
                        case "yse":
                            if (event.isActive) {
                                message.client.channels.cache.get("798776756952629298").send(`**The ${event.name} event has officially finished. Thanks for playing!**`);
                            }
                            await db.delete(`events.evnt${event.id}`);
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully ended the ${event.name} event!`)
                                .setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: null });
                        case "nop":
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit({ embed: cancelMessage, component: null });
                        default:
                            break;
                    }
                }
            });
            collector.on("end", () => {
                if (!processed) {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit({ embed: cancelMessage, component: null });
                }
            });
        }
    }
};
//# sourceMappingURL=endevent.js.map