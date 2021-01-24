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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith(".json"));

module.exports = {
	name: "randomrace",
	aliases: ["rr"],
	usage: "(no arguments required)",
	args: 0,
	isExternal: true,
	adminOnly: false,
	cooldown: 10,
	description: "Does a random race where you are faced with a randomly generated opponent on a randomly generated track. May the RNG be with you.",
	async execute(message) {
		const db = message.client.db;
		const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
		const filter = (reaction, user) => {
			return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎" || reaction.emoji.name === "⏩") && user.id === message.author.id;
		};
		const raceCommand = require("./sharedfiles/race.js");
		const playerData = await db.get(`acc${message.author.id}`);
		const player = playerData.hand;

		if (!player) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like your hand is empty.")
				.setDescription("Use `cd-sethand` to set your hand!")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		var trackset = playerData.rrTrackset;
		var opponent = playerData.rrOpponent;

		if (!trackset || !opponent || !carFiles.includes(opponent.carFile)) {
			randomize();
		}
		if (!playerData.rrWinStreak) {
			playerData.rrWinStreak = 0;
		}
		await db.set(`acc${message.author.id}`, playerData);

		const track = require(`./tracksets/${trackset}`);
		const playerCar = createCar(player);
		const opponentCar = createCar(opponent);
		const playerList = createList(player);
		const opponentList = createList(opponent);
		const intermission = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Ready to Play? (React with ✅ to proceed, ❎ to cancel or ⏩ to skip the race and have your progress reset.)")
			.setDescription(`Trackset: ${track["trackName"]}`)
			.addFields(
				{ name: "Your Hand", value: playerList, inline: true },
				{ name: "Opponent's Hand", value: opponentList, inline: true }
			)
			.setFooter(`Current Win Streak: ${playerData.rrWinStreak}`)
			.setTimestamp();

		message.channel.send(intermission).then(reactionMessage => {
			reactionMessage.react("✅");
			reactionMessage.react("❎");
			reactionMessage.react("⏩");
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
								playerData.rrWinStreak++;
								let reward;
								if (playerData.rrWinStreak <= 58) {
									reward = playerData.rrWinStreak * 500 + 1000;
								}
								else if (playerData.rrWinStreak > 58 && playerData.rrWinStreak <= 98) {
									reward = playerData.rrWinStreak * 250 + 30000;
								}
								else if (playerData.rrWinStreak > 98 && playerData.rrWinStreak <= 198) {
									reward = playerData.rrWinStreak * 200 + 50000;
								}
								else if (playerData.rrWinStreak > 198 && playerData.rrWinStreak <= 348) {
									reward = playerData.rrWinStreak * 100 + 100000;
								}
								else {
									reward = playerData.rrWinStreak * 50 + 250000;
								}
								playerData.unclaimedRewards.money += reward;
								message.channel.send(`**You have earned ${moneyEmoji}${reward}! Claim your reward using \`cd-rewards\`.**`);
								randomize();
							}
							else if (result === 0) {
								randomize();
							}
							else {
								playerData.rrWinStreak = 0;
								randomize();
							}

							await db.set(`acc${message.author.id}`, playerData);	
							return;
						case "❎":
							intermission.setTitle("Action cancelled.");
							return reactionMessage.edit(intermission);
						case "⏩":
							playerData.rrWinStreak = 0;
							randomize();
							await db.set(`acc${message.author.id}`, playerData);

							const skipMessage = new Discord.MessageEmbed()
								.setColor("#34aeeb")
								.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
								.setTitle("Successfully skipped race.")
								.setDescription("Your win streak has been reset.")
								.setTimestamp();
							return reactionMessage.edit(skipMessage);
						default:
							break;
					}
				})
				.catch(error => {
					console.log(error);
					reactionMessage.reactions.removeAll();
					intermission.setTitle("Action cancelled automatically.");
					return reactionMessage.edit(intermission);
				});
		});

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

		function randomize() {
			trackset = tracksets[Math.floor(Math.random() * tracksets.length)];
			playerData.rrTrackset = trackset;

			let opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
		    let hmm = require(`./cars/${opponentCarFile}`);
			while (hmm["isPrize"] === true) {
				opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
		    	hmm = require(`./cars/${opponentCarFile}`);
			}
			const upgradeIndex = Math.floor(Math.random() * 4);
			let upgradePattern = [0, 0, 0];
			switch (upgradeIndex) {
				case 0:
					break;
				case 1:
					upgradePattern = [3, 3, 3];
					break;
				case 2:
					upgradePattern = [6, 6, 6];
					break;
				case 3:
					const maxedTunes = [996, 969, 699];
					let i = 0;
					while (!hmm[`${maxedTunes[i]}TopSpeed`]) {
						i = Math.floor(Math.random() * maxedTunes.length);
					}
					upgradePattern = Array.from(maxedTunes[i].toString(), (val) => Number(val));
					break;
				default:
					break;
			}
			opponent = { carFile: opponentCarFile, gearingUpgrade: upgradePattern[0], engineUpgrade: upgradePattern[1], chassisUpgrade: upgradePattern[2] };
			playerData.rrOpponent = opponent;
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