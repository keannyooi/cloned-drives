/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const { DateTime } = require("luxon");

module.exports = {
    name: "startchallenge",
	aliases: ["launchchallenge"],
    usage: "(no arguments required)",
    args: 0,
	isExternal: false,
    adminOnly: false,
    description: "Starts the inactive challenge.",
    async execute(message) {
		const db = message.client.db;
		const challenge = await db.get("challenge");
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };

		if (!message.member.roles.cache.has("802043346951340064")) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, you don't have access to this command.")
				.setDescription("This command is only accessible if you have the Community Management role.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		const confirmationMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Are you sure you want to start the ${challenge.name} challenge?`)
            .setDescription("React with ✅ to proceed or ❎ to cancel.")
            .setTimestamp();

        let reactionMessage = await message.channel.send(confirmationMessage);
        reactionMessage.react("✅");
        reactionMessage.react("❎");
    	reactionMessage.awaitReactions(emojiFilter, {
            max: 1,
            time: 10000,
            errors: ["time"]
        })
            .then(async collected => {
				reactionMessage.reactions.removeAll();
				switch (collected.first().emoji.name) {
                    case "✅":
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
        				return reactionMessage.edit(infoScreen);
                    case "❎":
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled.")
                            .setTimestamp();
                        return reactionMessage.edit(cancelMessage);
                    default:
                        break;
                }
			})
			.catch(error => {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				console.log(error);
                const cancelMessage = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Action cancelled automatically.")
                    .setTimestamp();
                return reactionMessage.edit(cancelMessage);
            });
    }
}