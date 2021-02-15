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
	isExternal: false,
    adminOnly: true,
    description: "Ends an ongoing event.",
    async execute(message, args) {
		const db = message.client.db;
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };
        let events = await db.get("events");

		let eventName = args.join(" ").toLowerCase();
		const event = events.find(event => {
			return event.name.toLowerCase().includes(eventName)
		});

		if (event === undefined) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 event not found.")
                .setDescription("Check the list of events using the command `cd-events`.")
                .setTimestamp();
            return message.channel.send(errorScreen);
		}
		else {
			const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to end the ${event.name} event?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setTimestamp();

            let reactionMessage = await message.channel.send(confirmationMessage);;
            reactionMessage.react("✅");
            reactionMessage.react("❎");
            reactionMessage.awaitReactions(emojiFilter, {
                max: 1,
                time: 10000,
                errors: ['time']
            })
                .then(async collected => {
					reactionMessage.reactions.removeAll();
					switch (collected.first().emoji.name) {
                        case "✅":
							if (event.isActive) {
								message.client.channels.cache.get("798776756952629298").send(`**The ${event.name} event has officially finished. Thanks for playing!**`);
							}
                            events.splice(events.indexOf(event), 1);
							await db.set("events", events);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

							const infoScreen = new Discord.MessageEmbed()
            					.setColor("#34aeeb")
            					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            					.setTitle(`Successfully ended the ${event.name} event!`)
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
}