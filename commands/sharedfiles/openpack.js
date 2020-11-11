const Discord = require("discord.js-light");
const fs = require("fs");

module.exports = {
	async openPack(message, currentPack) {
		const carFiles = fs.readdirSync('./commands/cars').filter(file => file.endsWith('.json'));
		const waitTime = 20000;
		const cardFilter = currentPack["filter"];
		const filter = (reaction, user) => {
            return reaction.emoji.name === "➡️" && user.id === message.author.id;
        };
		var sequence;
		var currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		var pulledCards = "";

		switch (currentPack["packType"]) {
			case "Regular":
				sequence = [{ low: 1, high: 19 }, { low: 20, high: 29 }, { low: 20, high: 29 }, { low: 30, high: 39 }, { low: 40, high: 100 }];
				break;
			default:
				break;
		}

		var cardCount = 1;
		//----------Card 1-------------
		while (currentCard["rq"] < sequence[0].low || currentCard["rq"] > sequence[0].high || filterCard(currentCard, cardFilter) === false) {
			currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		}
		var rarity = rarityCheck(currentCard);
		var pulledCards = `(${rarity} ${currentCard["rq"]}) ` + currentCard["make"] + ' ' + currentCard["model"] + ' (' + currentCard["modelYear"] + ')\n';

		var packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("React with ➡️ to reveal the next card.")
			.setThumbnail(currentPack["pack"])
			.setImage(currentCard["card"])
			.addField('Cards Pulled:', pulledCards)
			.setFooter(`Card ${cardCount} of 5`)
			.setTimestamp();

		const packMessage = await message.channel.send(packScreen);
		packMessage.react("➡️");
		try {
			await packMessage.awaitReactions(filter, {
				max: 1,
				time: waitTime,
				errors: ['time']
			});
		}
		catch (error) {
			console.log("moved one to next card automatically");
		}
		//----------Card 2-------------
		packMessage.reactions.removeAll();
		cardCount++;
		currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		while (currentCard["rq"] < sequence[1].low || currentCard["rq"] > sequence[1].high || !filterCard(currentCard, cardFilter)) {
			currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		}

		rarity = rarityCheck(currentCard);
		pulledCards += `(${rarity} ${currentCard["rq"]}) ` + currentCard["make"] + ' ' + currentCard["model"] + ' (' + currentCard["modelYear"] + ')\n';
		packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("React with ➡️ to reveal the next card.")
			.setThumbnail(currentPack["pack"])
			.setImage(currentCard["card"])
			.addField('Cards Pulled:', pulledCards)
			.setFooter(`Card ${cardCount} of 5`)
			.setTimestamp();

		packMessage.edit(packScreen);
		packMessage.react("➡️");
		try {
			await packMessage.awaitReactions(filter, {
				max: 1,
				time: waitTime,
				errors: ['time']
			});
		}
		catch (error) {
			console.log("moved one to next card automatically");
		}
		//----------Card 3-------------
		packMessage.reactions.removeAll();
		cardCount++;
		currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		while (currentCard["rq"] < sequence[2].low || currentCard["rq"] > sequence[2].high || !filterCard(currentCard, cardFilter)) {
			currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		}

		rarity = rarityCheck(currentCard);
		pulledCards += `(${rarity} ${currentCard["rq"]}) ` + currentCard["make"] + ' ' + currentCard["model"] + ' (' + currentCard["modelYear"] + ')\n';
		packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("React with ➡️ to reveal the next card.")
			.setThumbnail(currentPack["pack"])
			.setImage(currentCard["card"])
			.addField('Cards Pulled:', pulledCards)
			.setFooter(`Card ${cardCount} of 5`)
			.setTimestamp();

		packMessage.edit(packScreen);
		packMessage.react("➡️");
		try {
			await packMessage.awaitReactions(filter, {
				max: 1,
				time: waitTime,
				errors: ['time']
			});
		}
		catch (error) {
			console.log("moved one to next card automatically");
		}
		//----------Card 4-------------
		packMessage.reactions.removeAll();
		cardCount++;
		currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		while (currentCard["rq"] < sequence[3].low || currentCard["rq"] > sequence[3].high || !filterCard(currentCard, cardFilter)) {
			currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		}

		rarity = rarityCheck(currentCard);
		pulledCards += `(${rarity} ${currentCard["rq"]}) ` + currentCard["make"] + ' ' + currentCard["model"] + ' (' + currentCard["modelYear"] + ')\n';
		packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("React with ➡️ to reveal the next card.")
			.setThumbnail(currentPack["pack"])
			.setImage(currentCard["card"])
			.addField('Cards Pulled:', pulledCards)
			.setFooter(`Card ${cardCount} of 5`)
			.setTimestamp();

		packMessage.edit(packScreen);
		packMessage.react("➡️");
		try {
			await packMessage.awaitReactions(filter, {
				max: 1,
				time: waitTime,
				errors: ['time']
			});
		}
		catch (error) {
			console.log("moved one to next card automatically");
		}
		//----------Card 5-------------
		packMessage.reactions.removeAll();
		cardCount++;
		currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		while (currentCard["rq"] < sequence[4].low || currentCard["rq"] > sequence[4].high || !filterCard(currentCard, cardFilter)) {
			currentCard = require(`../cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
		}

		rarity = rarityCheck(currentCard);
		pulledCards += `(${rarity} ${currentCard["rq"]}) ` + currentCard["make"] + ' ' + currentCard["model"] + ' (' + currentCard["modelYear"] + ')\n';
		packScreen = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setTitle(`Opening ${currentPack["packName"]}...`)
			.setDescription("~~React with ➡️ to reveal the next card.~~")
			.setThumbnail(currentPack["pack"])
			.setImage(currentCard["card"])
			.addField('Cards Pulled:', pulledCards)
			.setFooter(`Card ${cardCount} of 5`)
			.setTimestamp();

		packMessage.edit(packScreen);

		function filterCard(currentCard, filter) {
			var passed = true;
			if (currentCard["isPrize"] === false) {
				for (var criteria in filter) {
					if (filter[criteria] !== "None") {
						console.log(criteria);
						switch (criteria) {
							case "modelYear":
								if (currentCard["modelYear"] < filter["modelYear"]["start"] || currentCard["modelYear"] > filter["modelYear"]["end"]) {
									passed = false;
								}
								break;
							default:
								if (currentCard[criteria] !== filter[criteria]) {
									passed = false;
								}
								break;
						}
					}
				}
			}
			else {
				passed = false;
			}
			return passed;
		}

		function rarityCheck(currentCar) {
        	if (currentCar["rq"] > 79) { //leggie
            	return message.guild.emojis.cache.find(emoji => emoji.name === "legendary");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.guild.emojis.cache.find(emoji => emoji.name === "epic");
            }
        	else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
            	return message.guild.emojis.cache.find(emoji => emoji.name === "ultrarare");
        	}
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.guild.emojis.cache.find(emoji => emoji.name === "superrare");
        	}
        	else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
            	return message.guild.emojis.cache.find(emoji => emoji.name === "rare");
            }
        	else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
            	return message.guild.emojis.cache.find(emoji => emoji.name === "uncommon");
        	}
            else { //common
            	return message.guild.emojis.cache.find(emoji => emoji.name === "common");
        	}
        }
	}
}