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
    name: "endoffer",
	aliases: ["removeoffer", "rmvoffer"],
    usage: "<offer name goes here>",
    args: 1,
	category: "Community Management",
    description: "Ends an ongoing offer.",
    async execute(message, args) {
		const db = message.client.db;
		const filter = response => {
            return response.author.id === message.author.id;
        };
		
        let offers = await db.get("limitedOffers");
		const offerName = args.join(" ").toLowerCase();
		const searchResults = offers.filter(function(offer) {
			return offer.name.toLowerCase().includes(offerName);
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
							endOffer(searchResults[parseInt(collected.first()) - 1], currentMessage);
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
			endOffer(searchResults[0]);
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

		async function endOffer(offer, currentMessage) {
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
                .setTitle(`Are you sure you want to end the ${offer.name} offer?`)
                .setTimestamp();

            let reactionMessage, processed = false;
			if (currentMessage) {
				reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
			}
			else {
				reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
			}

			message.client.once("clickButton", async (button) => {
				if (button.clicker.id === message.author.id && button.message.id === reactionMessage.id) {
					yse.setDisabled();
					nop.setDisabled();
					row = new disbut.MessageActionRow().addComponents(yse, nop);
					processed = true;
					switch (button.id) {
						case "yse":
							await button.reply.defer();
							offers.splice(offers.indexOf(offer), 1);
							await db.set("limitedOffers", offers);
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);

							const infoScreen = new Discord.MessageEmbed()
            					.setColor("#34aeeb")
            					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            					.setTitle(`Successfully ended the ${offer.name} offer!`)
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
}