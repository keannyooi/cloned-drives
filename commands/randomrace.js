const Discord = require("discord.js-light");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith(".json"));

module.exports = {
	name: "randomrace",
	aliases: ["rr"],
	usage: "(no arguments required)",
	args: false,
	adminOnly: false,
	cooldown: 20,
	description: "Does a random race where you are faced with a randomly generated opponent on a randomly generated track. May the RNG be with you.",
	async execute(message) {
		const db = message.client.db;
		const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
		const filter = (reaction, user) => {
			return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
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

		if (!trackset || !opponent) {
			await randomize();
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
			.setTitle("Ready to Play? (React with ✅ to proceed or ❎ to cancel.)")
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
			reactionMessage.awaitReactions(filter, {
				max: 1,
				time: 10000,
				errors: ["time"]
			})
				.then(async collected => {
					reactionMessage.reactions.removeAll();
					if (collected.first().emoji.name === "✅") {
						const result = await raceCommand.race(message, playerCar, opponentCar, track);
						const delay = ms => new Promise(res => setTimeout(res, ms));
						await delay(2000);

						if (result > 0) {
							const reward = (playerData.rrWinStreak + 1) * 500;
							console.log(reward);
							playerData.unclaimedRewards.money += reward;
							playerData.rrWinStreak++;
							message.channel.send(`**You have earned ${moneyEmoji}${reward}! Claim your reward using \`cd-rewards\`.**`);
							await randomize();
						}
						else if (result === 0) {
							await randomize();
						}
						else {
							playerData.rrWinStreak = 0;
							await randomize();
						}

						await db.set(`acc${message.author.id}`, playerData);
						return;
					}
					else if (collected.first().emoji.name === "❎") {
						const cancelMessage = new Discord.MessageEmbed()
							.setColor("#34aeeb")
							.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
							.setTitle("Action cancelled.")
							.setTimestamp();
						return message.channel.send(cancelMessage);
					}
				})
				.catch((error) => {
					console.log(error);
					const cancelMessage = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Action cancelled automatically.")
						.setTimestamp();
					return message.channel.send(cancelMessage);
				});
		});

		function createList(currentCar) {
			const car = require(`./cars/${currentCar.carFile}`);
			const rarity = rarityCheck(car);
			var topSpeed;
			var carSpecs = `(${rarity} ${car["rq"]}) ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;

			switch (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) {
				case 0:
					topSpeed = car["topSpeed"];
					carSpecs += `Top Speed: ${car["topSpeed"]}MPH\n`;
					carSpecs += `0-60MPH: ${car["0to60"]} sec\n`;
					carSpecs += `Handling: ${car["handling"]}\n`;
					break;
				case 9:
					topSpeed = car["1StarTopSpeed"];
					carSpecs += `Top Speed: ${car["1StarTopSpeed"]}MPH\n`;
					carSpecs += `0-60MPH: ${car["1Star0to60"]} sec\n`;
					carSpecs += `Handling: ${car["1StarHandling"]}\n`;
					break;
				case 18:
					topSpeed = car["2StarTopSpeed"];
					carSpecs += `Top Speed: ${car["2StarTopSpeed"]}MPH\n`;
					carSpecs += `0-60MPH: ${car["2Star0to60"]} sec\n`;
					carSpecs += `Handling: ${car["2StarHandling"]}\n`;
					break;
				case 24:
					topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedTopSpeed`];
					carSpecs += `Top Speed: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedTopSpeed`]}MPH\n`;
					carSpecs += `0-60MPH: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Maxed0to60`]} sec\n`;
					carSpecs += `Handling: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedHandling`]}\n`;
					break;
				default:
					break;
			}
			carSpecs += `Drive Type: ${car["driveType"]}\n`;
			carSpecs += `${car["tyreType"]} Tyres\n`;
			carSpecs += `Weight: ${car["weight"]}kg\n`;
			carSpecs += `Ground Clearance: ${car["gc"]}\n`;
			carSpecs += `TCS: ${car["tcs"]}, ABS: ${car["abs"]}\n`;
			if (topSpeed >= 100) {
				carSpecs += `MRA: ${car["mra"]}\n`;
			}
			else {
				carSpecs += "MRA: N/A\n";
			}
			if (topSpeed >= 60) {
				carSpecs += `OLA: ${car["ola"]}\n`;
			}
			else {
				carSpecs += "OLA: N/A\n";
			}

			return carSpecs;
		}

		function getRacehud(currentCar, upgrade) {
			switch (upgrade) {
				case "000":
					return currentCar["racehudStock"];
				case "333":
					return currentCar["racehud1Star"];
				case "666":
					return currentCar["racehud2Star"];
				case "996":
					return currentCar["racehudMaxed996"];
				case "969":
					return currentCar["racehudMaxed969"];
				case "699":
					return currentCar["racehudMaxed699"];
				default:
					return;
			}
		}

		function createCar(currentCar) {
			const car = require(`./cars/${currentCar.carFile}`);
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
				racehud: getRacehud(car, `${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`)
			};

			switch (currentCar.gearingUpgrade + currentCar.engineUpgrade + currentCar.chassisUpgrade) {
				case 0:
					break;
				case 9:
					carModule.topSpeed = car["1StarTopSpeed"];
					carModule.accel = car["1Star0to60"];
					carModule.handling = car["1StarHandling"];
					break;
				case 18:
					carModule.topSpeed = car["2StarTopSpeed"];
					carModule.accel = car["2Star0to60"];
					carModule.handling = car["2StarHandling"];
					break;
				case 24:
					carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedTopSpeed`];
					carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Maxed0to60`];
					carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}MaxedHandling`];
				default:
					break;
			}
			if (carModule.topSpeed < 100) {
				carModule.mra = 0;
			}
			if (carModule.topSpeed < 60) {
				carModule.ola = 0;
			}
			
			return carModule;
		}

		function randomize() {
			playerData.rrTrackset = tracksets[Math.floor(Math.random() * tracksets.length)];

			const opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
			const upgradeIndex = Math.floor(Math.random() * 4);
			var upgradePattern = [0, 0, 0];
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
					const opponentCar = require(`./cars/${opponentCarFile}`);
					var i = 0;
					while (!opponentCar[`${maxedTunes[i]}MaxedTopSpeed`]) {
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