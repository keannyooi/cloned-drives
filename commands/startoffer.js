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
    name: "startoffer",
	aliases: ["launchoffer"],
    usage: "<offer name goes here>",
    args: 1,
	isExternal: false,
    adminOnly: false,
    description: "Starts an inactive offer.",
    async execute(message, args) {
		const db = message.client.db;
		const filter = response => {
            return response.author.id === message.author.id;
        };
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };
        const offers = await db.get("limitedOffers");

		if (!message.member.roles.cache.has("802043346951340064")) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, you don't have access to this command.")
				.setDescription("This command is only accessible if you are a part of Community Management.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		let offerName = args.join(" ").toLowerCase();
		const searchResults =  offers.filter(offer => {
			return offer.name.toLowerCase().includes(offerName) && offer.isActive === false;
		});

		if (searchResults.length > 1) {
			let offerList = "";
			for (i = 1; i <= searchResults.length; i++) {
				offerList += `${i} - ${searchResults[i - 1].name} \n`;
			}

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Multiple offers found, please type one of the following.")
				.setDescription(offerList)
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
							startOffer(searchResults[parseInt(collected.first()) - 1], currentMessage);
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
			startOffer(searchResults[0]);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, 404 offer not found.")
				.setDescription("Try checking again using `cd-limitedoffers`.")
				.addField("Keywords Received", `\`${offerName.join(" ")}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		async function startOffer(offer, currentMessage) {
			const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to start the ${offer.name} offer?`)
                .setDescription("React with ✅ to proceed or ❎ to cancel.")
                .setTimestamp();

            let reactionMessage;
			if (currentMessage) {
				reactionMessage = await currentMessage.edit(confirmationMessage);
			}
			else {
				reactionMessage = await message.channel.send(confirmationMessage);
			}
			
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
							offer.isActive = true;
							if (offer.timeLeft !== "unlimited") {
								offer.deadline = DateTime.now().plus({ days: offer.timeLeft }).toISO();
							}
							await db.set("limitedOffers", offers);
							message.client.channels.cache.get("798776756952629298").send(`**The ${offer.name} offer has officially gone up for sale!**`);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

							const infoScreen = new Discord.MessageEmbed()
            					.setColor("#34aeeb")
            					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            					.setTitle(`Successfully started the ${offer.name} offer!`)
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