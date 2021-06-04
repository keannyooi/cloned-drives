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
	name: "playevent",
	aliases: ["pe"],
	usage: "<event name>",
	args: 1,
	isExternal: true,
	adminOnly: false,
	cooldown: 10,
	description: "Participates in an event by doing a race.",
	async execute(message, args) {
		const db = message.client.db;
		const filter = response => {
            return response.author.id === message.author.id;
        };
		const emojiFilter = (reaction, user) => {
			return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
		};
		const raceCommand = require("./sharedfiles/race.js");
		const playerData = await db.get(`acc${message.author.id}`);
		const player = playerData.hand;

		if (!player) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like your hand is empty.")
				.setDescription("Use `cd-sethand` to set your hand!")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		let eventName = args.map(i => i.toLowerCase());
		let events = await db.get("events");
		const searchResults = Object.values(events).filter(function(event) {
			if (typeof event === "object") {
				return eventName.every(part => event.name.toLowerCase().includes(part));
			}
			else {
				return false;
			}
		});

		if (searchResults.length > 1) {
			let eventList = "";
			for (i = 1; i <= searchResults.length; i++) {
				eventList += `${i} - ${searchResults[i - 1].name} \n`;
			}

			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Multiple events found, please type one of the following.")
				.setDescription(eventList)
				.setTimestamp();

			message.channel.send(infoScreen).then(currentMessage => {
				message.channel.awaitMessages(filter, {
					max: 1,
					time: 30000,
					errors: ["time"]
				})
					.then(collected => {
						collected.first().delete();
						if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
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
							playEvent(searchResults[parseInt(collected.first()) - 1], currentMessage);
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
			playEvent(searchResults[0]);
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, 404 event not found.")
				.setDescription("Try checking again using `cd-events`.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

        async function playEvent(event, currentMessage) {
			console.log(event);
			let round = event.players[`acc${message.author.id}`];
			if (!round) {
				round = 1;
			}
			else if (round > event.roster.length) {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("You have already completed this event.")
					.setDescription("Try out the other events, if available.")
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}

			let test = require(`./cars/${player.carFile}`), passed = true;
			for (const [key, value] of Object.entries(event.roster[round - 1].requirements)) {
				console.log(key, value);
				switch (typeof value) {
					case "object":
						if (Array.isArray(value)) {
							if (key === "search") {
								let make = test["make"];
								if (typeof make === "object") {
									make = test["make"][0];
								}
								let name = `${make} ${test["model"]}`;

								if (value.some(h => name.toLowerCase().includes(h)) === false) {
									passed = false;
								}
							}
							else if (Array.isArray(test[`${key}`])) {
								if (value.some(h => test[`${key}`].map(i => i.toLowerCase()).includes(h)) === false) {
									passed = false;
								}
							}
							else {
								if (value.some(h => test[`${key}`].toLowerCase() === h) === false) {
									passed = false;
								}	
							}
						}
						else {
							if (test[`${key}`] < value.start || test[`${key}`] > value.end) {
								passed = false;
							}
						}
						break;
					case "boolean":
						if (value !== test[`${key}`]) {
							passed = false;
						}
						break;
					case "string":
						if (value !== player.carFile) {
							passed = false;
						}
						break;
					default:
						break;
				}
			}

			if (passed === false) {
				let make = test["make"];
				if (typeof make === "object") {
					make = test["make"][0];
				}
				let rarity = rarityCheck(test); 

				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, it looks like your hand does not meet the event round's requirements.")
					.setDescription(`Try referring to the event list. 
					Round ${round}
					Current Hand: (${rarity} ${test["rq"]}) ${make} ${test["model"]} (${test["modelYear"]}) [${player.gearingUpgrade}${player.engineUpgrade}${player.chassisUpgrade}]`)
					.setTimestamp();
				if (currentMessage && message.channel.type === "text") {
					return currentMessage.edit(errorMessage);
				}
				else {
					return message.channel.send(errorMessage);
				}
			}

			if (event.isActive || message.member.roles.cache.has("802043346951340064")) {
				const track = require(`./tracksets/${event.roster[round - 1].trackset}`);
				const opponent = { carFile: event.roster[round - 1].car, gearingUpgrade: event.roster[round - 1].gearingUpgrade, engineUpgrade: event.roster[round - 1].engineUpgrade, chassisUpgrade: event.roster[round - 1].chassisUpgrade };
				const [playerCar, playerList] = createCar(player);
				const [opponentCar, opponentList] = createCar(opponent);
				const intermission = new Discord.MessageEmbed()
					.setColor("#34aeeb")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Ready to Play? (React with ✅ to proceed or ❎ to cancel.)")
					.setDescription(`Trackset: ${track["trackName"]}`)
					.addFields(
						{ name: "Your Hand", value: playerList, inline: true },
						{ name: "Opponent's Hand", value: opponentList, inline: true }
					)
					.setFooter(`Event: ${event.name} (Round ${round})`)
					.setTimestamp();

				let reactionMessage;
				if (currentMessage && message.channel.type === "text") {
					reactionMessage = await currentMessage.edit(intermission);
				}
				else {
					reactionMessage = await message.channel.send(intermission);
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
								if (event.isActive === true && event.timeLeft !== "unlimited" && Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(event.deadline)).invalid !== null) {
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									const end = new Discord.MessageEmbed()
										.setColor("#34aeeb")
										.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
										.setTitle("Looks like this event has ended.")
										.setDescription("rip")
										.setTimestamp();
									return reactionMessage.edit(end);
								}

								const result = await raceCommand.race(message, playerCar, opponentCar, track);
								const delay = ms => new Promise(res => setTimeout(res, ms));
								await delay(2000);

								if (result > 0) {
									round++;
									event.players[`acc${message.author.id}`] = round;
									await db.set(`events.evnt${event.id}`, event);
									//await db.set(`events.evnt${event.id}.players.acc${message.author.id}`, round);	
									for (let [key, value] of Object.entries(event.roster[round - 2].reward)) {
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
									message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
									return message.channel.send(`**You have beaten Round ${round - 1}! Claim your reward using \`cd-rewards\`.**`);
								}
							case "❎":
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								intermission.setTitle("Action cancelled.");
								return reactionMessage.edit(intermission);
							default:
								break;
						}
					})
					.catch(error => {
						console.log(error);
						reactionMessage.reactions.removeAll();
						message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
						intermission.setTitle("Action cancelled automatically.");
						return reactionMessage.edit(intermission);
					});
			}
			else {
				message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
				const errorMessage = new Discord.MessageEmbed()
					.setColor("#fc0303")
					.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
					.setTitle("Error, you may not play this event yet.")
					.setDescription("The event you are trying to play is not active currently. This is only bypassable if you are part of Community Management.")
					.setTimestamp();
				return message.channel.send(errorMessage);
			}
		}

		function createCar(currentCar) {
            const car = require(`./cars/${currentCar.carFile}`);
			const rarity = rarityCheck(car);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}

            const carModule = {
                topSpeed: car["topSpeed"],
                accel: car["0to60"],
                handling: car["handling"],
                driveType: car["driveType"],
                tyreType: car["tyreType"],
                weight: car["weight"],
                gc: car["gc"],
                tcs: car["tcs"],
                abs: car["abs"],
                mra: car["mra"],
                ola: car["ola"],
                racehud: car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`]
            };

            if (currentCar.gearingUpgrade > 0) {
                carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`];
                carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`];
                carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`];
            }

			let carSpecs = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;
			carSpecs += `Top Speed: ${carModule.topSpeed}MPH\n`;
			if (carModule.topSpeed < 60) {
				carModule.accel = 99.9;
				carSpecs += "0-60MPH: N/A\n";
			}
			else {
				carSpecs += `0-60MPH: ${carModule.accel} sec\n`;
			}
            carSpecs += `Handling: ${carModule.handling}\n`;
			carSpecs += `Drive Type: ${carModule.driveType}\n`;
            carSpecs += `${carModule.tyreType} Tyres\n`;
            carSpecs += `Weight: ${carModule.weight}kg\n`;
            carSpecs += `Ground Clearance: ${carModule.gc}\n`;
            carSpecs += `TCS: ${carModule.tcs}, ABS: ${carModule.abs}\n`;

			if (carModule.topSpeed < 100) {
				carModule.mra = 0;
				carSpecs += "MRA: N/A\n";
			}
			else {
				carSpecs += `MRA: ${carModule.mra}\n`;
			}
			if (carModule.topSpeed < 30) {
				carModule.ola = 0;
				carSpecs += "OLA: N/A\n";
			}
			else {
				carSpecs += `OLA: ${carModule.ola}\n`;
			}

            return [carModule, carSpecs];
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