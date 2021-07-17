/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const disbut = require("discord-buttons");
const { DateTime } = require("luxon");

module.exports = {
    name: "startchallenge",
    aliases: ["launchchallenge"],
    usage: "(no arguments required)",
    args: 0,
    category: "Community Management",
    description: "Starts the inactive challenge.",
    async execute(message) {
        const db = message.client.db;
        const challenge = await db.get("challenge");
        let yse = new disbut.MessageButton()
            .setStyle("green")
            .setLabel("Yes!")
            .setID("yse");
        let nop = new disbut.MessageButton()
            .setStyle("red")
            .setLabel("No!")
            .setID("nop");
        let row = new disbut.MessageActionRow().addComponents(yse, nop);
        const confirmationMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Are you sure you want to start the ${challenge.name} challenge?`)
            .setDescription("React with ✅ to proceed or ❎ to cancel.")
            .setTimestamp();
        let reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row }), processed = false;

        message.client.once("clickButton", async (button) => {
            if (button.clicker.id === message.author.id && button.message.id === reactionMessage.id) {
                yse.setDisabled();
                nop.setDisabled();
                row = new disbut.MessageActionRow().addComponents(yse, nop);
                processed = true;
                switch (button.id) {
                    case "yse":
                        await button.reply.defer();
                        challenge.isActive = true;
                        if (challenge.timeLeft !== "unlimited") {
                            challenge.deadline = DateTime.now().plus({ days: challenge.timeLeft }).toISO();
                        }
                        await db.set("challenge", challenge);
                        message.client.channels.cache.get("798776756952629298").send(`**The ${challenge.name} challenge has officially started!**`);
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

                        const infoScreen = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully started the ${challenge.name} challenge!`)
                            .setTimestamp();
                        return reactionMessage.edit({ embed: infoScreen, component: row });
                    case "nop":
                        await button.reply.defer();
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled.")
                            .setTimestamp();
                        return reactionMessage.edit({ embed: cancelMessage, component: row });
                    default:
                        break;
                }
            }
        });

        setTimeout(() => {
            if (!processed) {
                yse.setDisabled();
                nop.setDisabled();
                row = new disbut.MessageActionRow().addComponents(yse, nop);

                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const cancelMessage = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Action cancelled automatically.")
                    .setTimestamp();
                return reactionMessage.edit({ embed: cancelMessage, component: row });
            }
        }, 10000);
    }
}