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
	name: "playchallenge",
	aliases: ["pc"],
	usage: "<deck name>",
	args: 1,
	isExternal: true,
	adminOnly: false,
	cooldown: 10,
	description: "Participates in the challenge by doing a round of the challenge.",
	async execute(message, args) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const decks = playerData.decks;
		const filter = response => {
            return response.author.id === message.author.id;
        };

		let deckName = args[0];
		if (args[1]) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, deck name provided contains spaces.")
                .setDescription("Deck names cannot contain spaces. Consider replacing the spaces with underscores (_).")
                .setTimestamp();
            return message.channel.send(infoScreen);
		}

		const searchResults = decks.filter(function (deck) {
            return deck.name.includes(deckName);
        });

        if (searchResults.length > 1) {
            let deckList = "";
            for (i = 1; i <= searchResults.length; i++) {
                deckList += `${i} - ${searchResults[i - 1].name} \n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple decks found, please type one of the following.")
                .setDescription(deckList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
                    errors: ["time"]
                })
                    .then(collected => {
						collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
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
                            playChallenge(searchResults[parseInt(collected.first().content) - 1], currentMessage);
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
            playChallenge(searchResults[0]);
        }
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 deck not found.")
                .setDescription(`It looks like you don't have a deck named \`${deckName}\`.`)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function playChallenge(deck, currentMessage) {
			const deckCommand = require("./sharedfiles/deck.js");
			let challenge = await db.get("challenge");
			if (deck.hand.find(d => d === "None") !== undefined) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, deck selected incomplete.")
					.setDescription("You need 5 cars in a deck before you can use said deck.")
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}
			else if (challenge.players[`acc${message.author.id}`] >= challenge.roster.length) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("You have already completed the challenge.")
					.setDescription("It's time to take a break and relax.")
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}
			else if (challenge.isActive === false && !message.member.roles.cache.has("802043346951340064")) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, you may not play the challenge yet.")
					.setDescription("The challenge is not active currently. This is only bypassable if you are part of Community Management.")
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
			else if (challenge.isActive === true && challenge.timeLeft !== "idk" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline)).invalid !== null) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const end = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Looks like the challenge has ended.")
					.setDescription("rip")
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(end);
				}
				else {
					return message.channel.send(end);
				}
			}

			let checkArray = [];
			for (let i = 0; i < challenge.roster[challenge.players[`acc${message.author.id}`] || 0].requirements.length; i++) {
				let [key] = Object.entries(challenge.roster[challenge.players[`acc${message.author.id}`] || 0].requirements[i]);
				console.log(key);
				checkArray[i] = 0;

				for (let car of deck.hand) {
					let passed = true;
					let test = require(`./cars/${car}`);
					switch (typeof key[1]) {
						case "object":
							if (test[`${key[0]}`] < key[1].start || test[`${key[0]}`] > key[1].end) {
								passed = false;
							}
							break;
						case "boolean":
							if (key[1] !== test[`${key[0]}`]) {
								passed = false;
							}
							break;
						case "string":
							if (key[0] === "car") {
								if (key[1] !== car) {
									passed = false;
								}
							}
							else if (Array.isArray( test[`${key[0]}`])) {
								if (key[1].some(h => test[`${key[0]}`].map(i => i.toLowerCase()).includes(h)) === false) {
									passed = false;
								}
							}
							else {
								if (key[1] !== test[`${key[0]}`].toLowerCase()) {
									passed = false;
								}
							}
							break;
						default:
							break;
					}

					if (passed === true) {
						checkArray[i]++;
					}
				}
			}
			console.log(checkArray);

			for (let i = 0; i < checkArray.length; i++) {
				if (checkArray[i] < challenge.roster[challenge.players[`acc${message.author.id}`] || 0].requirements[i].amount) {
					let deckList = "";
					for (let i = 0; i < 5; i++) {
						let test =  require(`./cars/${deck.hand[i]}`);
						let make = test["make"];
						if (typeof make === "object") {
							make = test["make"][0];
						}
						let rarity = rarityCheck(test);
						deckList += `(${rarity} ${test["rq"]}) ${make} ${test["model"]} (${test["modelYear"]}) [${deck.tunes[i]}]\n`;
					}

					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorMessage = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, it looks like your deck does not meet the challenge round's requirements.")
						.setDescription(`Try referring to the challenge list. 
						Round ${(challenge.players[`acc${message.author.id}`] + 1) || 1}
						Current Deck: ${deck.name}\n${deckList}`)
						.setTimestamp();
					if (currentMessage && message.channel.type === "text") {
						return currentMessage.edit(errorMessage);
					}
					else {
						return message.channel.send(errorMessage);
					}
					break;
				}
			}

			let results = await deckCommand.assignIndex(message, deck, challenge.roster[challenge.players[`acc${message.author.id}`] || 0]);
			if (results === "kekw") return;
			if (results > 0) {
				let round = (challenge.players[`acc${message.author.id}`] + 1) || 1;
				//await db.set(`challenge.players.acc${message.author.id}`, round);
				challenge.players[`acc${message.author.id}`] = round;
				await db.set("challenge", challenge);

				for (let [key, value] of Object.entries(challenge.roster[round - 1].rewards)) {
					switch (key) {
						case "money":
						case "fuseTokens":
						case "trophies":
							playerData.unclaimedRewards[key] += value;
							break;
						case "car":
							let isInRewards = playerData.unclaimedRewards.cars.findIndex(car => {
								return car.carFile === value;
							});
							if (isInRewards !== -1) {
								playerData.unclaimedRewards.cars[isInRewards].amount++;
							}
							else {
								playerData.unclaimedRewards.cars.push({
									carFile: value,
									amount: 1
								});
							};
							break;
						case "pack":
							playerData.unclaimedRewards.packs.push(value);
							break;
						default:
							break;
					}
				}
				await db.set(`acc${message.author.id}`, playerData);
				return message.channel.send(`**You have successfully beaten Round ${round}! Claim your reward using \`cd-rewards\`.**`);
			}
		}

		function rarityCheck(currentCar) {
			if (currentCar["rq"] > 79) { //leggie
				return message.client.emojis.cache.get("726025494138454097");
			}
			else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
				return message.client.emojis.cache.get("726025468230238268");
			}
			else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
				return message.client.emojis.cache.get("726025431937187850");
			}
			else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
				return message.client.emojis.cache.get("726025394104434759");
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