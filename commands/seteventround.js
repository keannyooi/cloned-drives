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
    name: "seteventround",
	aliases: ["ser"],
    usage: "<player name> <event name> <round>",
    args: 3,
	isExternal: false,
    adminOnly: true,
    description: "Sets a player's round in an event to whatever.",
    async execute(message, args) {
		const db = message.client.db;
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };
        let events = await db.get("events");

		var userName = args[0].toLowerCase();
        var user, member;
        message.guild.members.cache.forEach(User => {
            if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                console.log("found!");
                user = User.user;
				member = message.guild.member(User);
            }
        });

		if (!user) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 user not found.")
                .setDescription("It looks like this user isn't in this server.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (user.bot) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, user requested is a bot.")
                .setDescription("Bots can't play Cloned Drives.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

		let eventName = args.slice(1, args.length - 1).join(" ").toLowerCase();
		const event = events.find(event => {
			return event.name.toLowerCase().includes(eventName)
		});

		if (event === undefined) {
			const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 event not found.")
                .setDescription("Check the list of events using the command `cd-events`.")
                .setTimestamp();
            return message.channel.send(errorScreen);
		}
		else {
			let round = args[args.length - 1];
			if (isNaN(round) || Math.ceil(parseInt(round)) < 1 || Math.ceil(parseInt(round)) > event.roster.length) {
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, round requested is either not a number or inapplicable.")
					.setDescription("Round numbers should be a number bigger than 0 and smaller or equal to the event's amount of rounds.")
					.addField("Amount of rounds that this event has", event.roster.length)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
			round = Math.ceil(parseInt(round));

			const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to set ${member.displayName}'s progress on ${event.name} to round ${round}?`)
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
							if (round === 1) {
								delete event.players[user.id]
							}
							else {
								event.players[user.id] = round - 1;
							}
							await db.set("events", events);
							const infoScreen = new Discord.MessageEmbed()
            					.setColor("#34aeeb")
            					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            					.setTitle(`Successfully set ${member.displayName}'s progress on ${event.name} to round ${round}!`)
            					.setTimestamp();
        					return reactionMessage.edit(infoScreen);
                        case "❎":
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit(cancelMessage);
                        default:
                            break;
                    }
				})
				.catch(error => {
					console.log(error);
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit(cancelMessage);
                });
				
		}
    }
}