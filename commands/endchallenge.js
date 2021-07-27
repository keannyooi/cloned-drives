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

module.exports = {
    name: "endchallenge",
    aliases: ["removechallenge", "rmvchallenge"],
    usage: "(no arguments required)",
    args: 0,
    category: "Community Management",
    description: "Ends the ongoing challenge.",
    async execute(message) {
        const db = message.client.db;
        const challenge = await db.get("challenge");
        const settings = await db.get(`acc${message.author.id}.settings`);
        const filter = (button) => {
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
            .setTitle(`Are you sure you want to end the ${challenge.name} challenge?`)
            .setTimestamp();
        let processed = false;
        await message.channel.send({ embed: confirmationMessage, component: row }).then(reactionMessage => {
            const collector = reactionMessage.createButtonCollector(filter, { time: 10000 });
            collector.on("collect", async button => {
                if (!processed) {
                    processed = true;
                    switch (button.id) {
                        case "yse":
                            await button.reply.defer();
                            if (challenge.isActive) {
                                message.client.channels.cache.get("798776756952629298").send(`**The ${challenge.name} challenge has officially finished. Thanks for playing!**`);
                            }
                            challenge.isActve = false;
                            challenge.players = {};
                            challenge.timeLeft = "unlimited";
                            challenge.deadline = "idk";
                            await db.set("challenge", challenge);
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully ended the ${challenge.name} challenge!`)
                                .setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: null });
                        case "nop":
                            await button.reply.defer();
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
        });
    }
}