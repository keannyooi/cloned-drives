/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const { DateTime, Interval } = require("luxon");

module.exports = {
    name: "limitedoffers",
    aliases: ["lo", "offers"],
    usage: "(no arguments required)",
    args: 0,
	category: "Gameplay",
    description: "Views all currently available offers.",
    async execute(message, args) {
		const db = message.client.db;
		const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
		const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
		let offers = await db.get("limitedOffers");
		console.log(offers);

		if (!args[0]) {
			if (!message.member.roles.cache.has("802043346951340064")) {
				offers = offers.filter(offer => {
					return offer.isActive === true;
				});
			}

			let listMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Limited Offers")
				.setFooter("Type cd-limitedoffers <offer name> to find out more about an offer.")
				.setTimestamp();
			if (offers.length > 0) {
				listMessage.setDescription("These offers are only for a limited time, be sure to get them before they disappear!");
				for (let i = 0; i < offers.length; i++) {
					let s = `${offers[i].name} (x${offers[i].amount})`;
					if (offers[i].isActive) {
						if (offers[i].timeLeft !== "unlimited") {
							let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offers[i].deadline));
							if (interval.invalid === null) {
								let days = Math.floor(interval.length("days"));
								let hours = Math.floor(interval.length("hours") - (days * 24));
								let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
								let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
								let intervalString = `${days}d ${hours}h ${minutes}m ${seconds}s`
								s += ` \`${intervalString} remaining\`\n`;
							}
							else {
								s += ` \`currently ending, no longer purchasable\`\n`;
							}
						}
						if (message.member.roles.cache.has("802043346951340064")) {
							s += " 🟢";
						}
					}
					listMessage.addField(s, `${moneyEmoji}${offers[i].price}`);
				}
			}
			else {
				listMessage.setDescription("There are currently no offers available.");
			}

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			return message.channel.send(listMessage);
		}
		else {
			const waitTime = 60000;
			const filter = response => {
				return response.author.id === message.author.id;
			};

			let offerName = args.map(i => i.toLowerCase());
			const searchResults = offers.filter(function (offer) {
				return offerName.every(part => offer.name.toLowerCase().includes(part));
			});

			if (searchResults.length > 1) {
				let offerList = "";
				for (i = 1; i <= searchResults.length; i++) {
					offerList += `${i} - ${searchResults[i - 1].name} (x${searchResults[i - 1].amount})\n`;
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
						time: waitTime,
						errors: ["time"]
					})
						.then(collected => {
							collected.first().delete();
							if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length) {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								const errorMessage = new Discord.MessageEmbed()
									.setColor("#fc0303")
									.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
									.setTitle("Error, invalid integer provided.")
									.setDescription("It looks like your response was either not a number or not part of the selection.")
									.setTimestamp();
								return currentMessage.edit(errorMessage);
							}
							else {
								displayInfo(searchResults[parseInt(collected.first().content) - 1], currentMessage);
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
				displayInfo(searchResults[0]);
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, offer requested not found.")
					.setDescription("Well that sucks.")
					.addField("Keywords Received", `\`${offerName.join(" ")}\``)
					.setTimestamp();
				return message.channel.send(errorMessage);
			}

			function displayInfo(currentOffer, currentMessage) {
				let infoScreen = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle(`${currentOffer.name} (x${currentOffer.amount - (currentOffer.players[message.author.id] || 0)} remaining)`)
					.setDescription(`This offer's current status: **${currentOffer.isActive}**
					Duration in days: \`${currentOffer.timeLeft}\`
					Price: ${moneyEmoji}${currentOffer.price}
					Contents of Offer:`)
					.setTimestamp();

				for (let [key, value] of Object.entries(currentOffer.offer)) {
					switch (key) {
						case "fuseTokens":
							infoScreen.addField("Fuse Tokens", `${fuseEmoji}${value}`, true);
							break;
						case "cars":
							let carList = "";
							for (let i = 0; i < value.length; i++) {
								let currentCar = require(`./cars/${value[i]}`);
								let rarity = rarityCheck(currentCar);
								let make = currentCar["make"];
								if (typeof make === "object") {
									make = currentCar["make"][0];
								}
								carList += `(${rarity} ${currentCar["rq"]}) ${make} ${currentCar["model"]} (${currentCar["modelYear"]})\n`
							}
							infoScreen.addField("Cars", carList, true);
							break;
						case "pack":
							let pack = require(`./packs/${value}`);
							infoScreen.addField("Pack", pack["packName"], true);
							break;
						default:
							break;
					}
				}
				
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				if (currentMessage) {
					return currentMessage.edit(infoScreen);
				}
				else {
					return message.channel.send(infoScreen);
				}
			}

			function rarityCheck(currentCar) {
				if (currentCar["rq"] > 79) { //leggie
					return message.client.emojis.cache.get("857512942471479337");
				}
				else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
					return message.client.emojis.cache.get("726025468230238268");
				}
				else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
					return message.client.emojis.cache.get("726025431937187850");
				}
				else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
					return message.client.emojis.cache.get("857513197937623042");
				}
				else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
					return message.client.emojis.cache.get("726025302656024586");
				}
				else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
					return message.client.emojis.cache.get("726025273421725756");
				}
				else { //common
					return message.client.emojis.cache.get("726020544264273928");
				}
			}
		}
    }
}