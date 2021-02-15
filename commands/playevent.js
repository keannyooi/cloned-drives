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
	name: "playevent",
	aliases: ["pe"],
	usage: "<event name>",
	args: 1,
	isExternal: false,
	adminOnly: false,
	cooldown: 10,
	description: "Participates in an event by doing a race.",
	async execute(message, args) {
		const db = message.client.db;
		const filter = (reaction, user) => {
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
		const events = await db.get("events");
		const event = events.find(event => {
			return event.name.toLowerCase().includes(eventName);
		});

        if (!event) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 event not found.")
                .setDescription("It looks like this event doesn't exist. Try referring to the event list.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
		
		let round = event.players[message.author.id];
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
            return message.channel.send(errorMessage);
		}

		let test = require(`./cars/${player.carFile}`), passed = true;
		for (const [key, value] of Object.entries(event.roster[round - 1].requirements)) {
            switch (typeof value) {
                case "object":
					if (test[`${key}`] < value.start || test[`${key}`] > value.end) {
						passed = false;
					}
                    break;
                case "string":
                case "boolean":
					if (Array.isArray(test[`${key}`])) {
						if (test[`${key}`].find(e => e.toLowerCase() === value) === undefined) {
							passed = false;
						}
					}
					else {
						if (value !== test[`${key}`].toLowerCase()) {
							passed = false;
						}
					}
                    break;
                default:
                    break;
            }
        }

		if (!passed) {
			let make = test["make"];
			if (typeof make === "object") {
				make = test["make"][0];
			}
			let rarity = rarityCheck(test);
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, it looks like your hand does not neet the event round's requirements.")
                .setDescription(`Try referring to the event list. \nRound ${round} \nCar: (${rarity} ${test["rq"]}) ${make} ${test["model"]} (${test["modelYear"]}) [${player.gearingUpgrade}${player.engineUpgrade}${player.chassisUpgrade}]`)
                .setTimestamp();
            return message.channel.send(errorMessage);
		}

		if (event.isActive || message.member.roles.cache.has("711790752853655563")) {
			const track = require(`./tracksets/${event.roster[round - 1].trackset}`);
			const opponent = { carFile: event.roster[round - 1].car, gearingUpgrade: event.roster[round - 1].gearingUpgrade, engineUpgrade: event.roster[round - 1].engineUpgrade, chassisUpgrade: event.roster[round - 1].chassisUpgrade };
			const playerCar = createCar(player);
			const opponentCar = createCar(opponent);
			const playerList = createList(player);
			const opponentList = createList(opponent);
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

			message.channel.send(intermission).then(reactionMessage => {
				reactionMessage.react("✅");
				reactionMessage.react("❎");
				reactionMessage.awaitReactions(filter, {
					max: 1,
					time: 10000,
					errors: ["time"]
				})
					.then(async collected => {
						reactionMessage.reactions.removeAll();
						switch (collected.first().emoji.name) {
							case "✅":
								const result = await raceCommand.race(message, playerCar, opponentCar, track);
								const delay = ms => new Promise(res => setTimeout(res, ms));
								await delay(2000);

								if (result > 0) {
									round++;
									events[events.indexOf(event)].players[`${message.author.id}`] = round;
									await db.set("events", events);	
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
			});
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Erorr, you may not play this event yet.")
                .setDescription("The event you are trying to play is not active currently. This is only bypassable if you are an Admin.")
                .setTimestamp();
            return message.channel.send(errorMessage);
		}

		function createList(currentCar) {
			const car = require(`./cars/${currentCar.carFile}`);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}
			const rarity = rarityCheck(car);
			var carSpecs = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;

			if (currentCar.gearingUpgrade > 0) {
				carSpecs += `Top Speed: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`]}MPH\n`;
				carSpecs += `0-60MPH: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`]} sec\n`;
				carSpecs += `Handling: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`]}\n`;
			}
			else {
				carSpecs += `Top Speed: ${car["topSpeed"]}MPH\n`;
				carSpecs += `0-60MPH: ${car["0to60"]} sec\n`;
				carSpecs += `Handling: ${car["handling"]}\n`;
			}
			carSpecs += `Drive Type: ${car["driveType"]}\n`;
			carSpecs += `${car["tyreType"]} Tyres\n`;
			carSpecs += `Weight: ${car["weight"]}kg\n`;
			carSpecs += `Ground Clearance: ${car["gc"]}\n`;
			carSpecs += `TCS: ${car["tcs"]}, ABS: ${car["abs"]}\n`;
			carSpecs += `MRA: ${car["mra"]}\n`;
			carSpecs += `OLA: ${car["ola"]}\n`;

			return carSpecs;
		}

		function createCar(currentCar) {
			const car = require(`./cars/${currentCar.carFile}`);
			const carModule = {
				rq: car["rq"],
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
			if (carModule.topSpeed < 100) {
				carModule.mra = 0;
			}
			if (carModule.topSpeed < 30) {
				carModule.ola = 0;
			}
			return carModule;
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