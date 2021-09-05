/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const stringSimilarity = require("string-similarity");

module.exports = {
	name: "testpack",
	aliases: ["tp"],
	usage: "<pack name goes here>",
	args: 1,
	category: "Miscellaneous",
	cooldown: 4.388,
	description: "Opens a pack, however the cars in said pack won't be added into your garage and you won't be charged. Perfect for those who have a gambling addiction.",
	async execute(message, args) {
		const openPackCommand = require("./sharedfiles/openpack.js");
		const filter = response => {
			return response.author.id === message.author.id;
		};

		let packName = args.map(i => i.toLowerCase());
		const searchResults = packFiles.filter(function (pack) {
			return packName.every(part => pack.includes(part));
		});

		if (searchResults.length > 1) {
			let packList = "";
			for (i = 1; i <= searchResults.length; i++) {
				let currentPack = require(`./packs/${searchResults[i - 1]}`);
				packList += `${i} - ${currentPack["packName"]}\n`;
			}

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Multiple packs found, please type one of the following.")
				.setDescription(packList)
				.setTimestamp();

			message.channel.send(infoScreen).then(currentMessage => {
				message.channel.awaitMessages(filter, {
					max: 1,
					time: 30000,
					errors: ['time']
				})
					.then(collected => {
						if (message.channel.type === "text") {
							collected.first().delete();
						}
						if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
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
							let currentPack = require(`./packs/${searchResults[parseInt(collected.first().content) - 1]}`);
							openPackCommand.openPack(message, currentPack);
							return message.channel.send("**Note: Since you opened this pack using `cd-testpack`, these cars won't be added into your garage and you won't be charged with money.**");
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
			let currentPack = require(`./packs/${searchResults[0]}`);
			openPackCommand.openPack(message, currentPack);
			return message.channel.send("**Note: Since you opened this pack using `cd-testpack`, these cars won't be added into your garage and you won't be charged with money.**");
		}
		else {
			let matches = stringSimilarity.findBestMatch(packName.join(" "), packFiles.map(i => i.slice(0, -5)));
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, pack requested not found.")
				.setDescription("Well that sucks.")
				.addField("Keywords Received", `\`${packName.join(" ")}\``, true)
				.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
}