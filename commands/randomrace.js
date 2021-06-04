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
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like your hand is empty.")
				.setDescription("Use `cd-sethand` to set your hand!")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		let trackset = playerData.rrTrackset;
		let opponent = playerData.rrOpponent;
		let reqs = playerData.rrReqs;
		let reqList = "";

		if (!playerData.rrWinStreak) {
			playerData.rrWinStreak = 0;
		}
		if (!trackset || !opponent || !carFiles.includes(opponent.carFile) || (playerData.rrWinStreak > 75 && !reqs)) {
			await randomize();
			reqs = {};
		}

		for (let [key, value] of Object.entries(reqs)) {
			switch (typeof value) {
				case "object":
					reqList += `\`${key}: ${value.start} ~ ${value.end}\`, `;
				case "string":
				case "boolean":
				case "number":
					if (key === "rq") {
						reqList += `\`${key}: 1 ~ ${value}\`, `;
					}
					else {
						reqList += `\`${key}: ${value}\`, `;
					}
					break;
				default:
					break;
			}
		}
		if (reqList.length === 0) {
			reqList = "None";
		}
		else {
			reqList = reqList.slice(0, -2);
		}

		const track = require(`./tracksets/${trackset}`);
		const [playerCar, playerList] = createCar(player);
		const [opponentCar, opponentList] = createCar(opponent);
		const intermission = new Discord.MessageEmbed()
			.setColor("#34aeeb")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Ready to Play? (React with ✅ to proceed, ❎ to cancel or ⏩ to skip the race and have your progress reset.)")
			.setDescription(`Trackset: ${track["trackName"]}, Requirements: ${reqList}`)
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
					if (message.channel.type === "text") {
						reactionMessage.reactions.removeAll();
					}
					switch (collected.first().emoji.name) {
						case "✅":
							let test = require(`./cars/${player.carFile}`), passed = true;
							for (const [key, value] of Object.entries(reqs)) {
								console.log(key, value);
								switch (typeof value) {
									case "object":
										if (test[`${key}`] < value.start || test[`${key}`] > value.end) {
											passed = false;
										}
										break;
									case "string":
									case "boolean":
										if (Array.isArray(test[`${key}`])) {
											if (test[`${key}`].find(e => e === value) === undefined) {
												passed = false;
											}
										}
										else {
											if (value.toLowerCase() !== test[`${key}`].toLowerCase()) {
												passed = false;
											}
										}
										break;
									case "number":
										if (value < test[`${key}`]) {
											passed = false;
										}
										break;
									default:
										break;
								}
							}
							if (!passed) {
								message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
								intermission.setTitle("Your hand does not meet the random race's requirements.");
								return reactionMessage.edit(intermission);
							}
							
							const result = await raceCommand.race(message, playerCar, opponentCar, track);
							const delay = ms => new Promise(res => setTimeout(res, ms));
							await delay(2000);

							if (result > 0) {
								playerData.rrWinStreak++;
								let reward = 0, rqBonus = 0, yse = 0;
								if (playerData.rrWinStreak <= 58) {
									reward = playerData.rrWinStreak * 500 + 1000;
									yse = 100;
								}
								else if (playerData.rrWinStreak > 58 && playerData.rrWinStreak <= 98) {
									reward = playerData.rrWinStreak * 250 + 30000;
									yse = 500;
								}
								else if (playerData.rrWinStreak > 98 && playerData.rrWinStreak <= 198) {
									reward = playerData.rrWinStreak * 200 + 50000;
									yse = 1000;
								}
								else {
									reward = playerData.rrWinStreak * 100 + 100000;
									yse = 5000;
								}

								if (playerCar.rq - opponentCar.rq <= 3) {
									rqBonus = (opponentCar.rq - playerCar.rq + 4) * yse;
								}
								playerData.unclaimedRewards.money += reward + rqBonus;
								message.channel.send(`**You have earned ${moneyEmoji}${reward} (+${moneyEmoji}${rqBonus} low RQ bonus)! Claim your reward using \`cd-rewards\`.**`);
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
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);	
							return;
						case "❎":
							intermission.setTitle("Action cancelled.");
							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
							return reactionMessage.edit(intermission);
						case "⏩":
							playerData.rrWinStreak = 0;
							await randomize();

							message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
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
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					intermission.setTitle("Action cancelled automatically.");
					return reactionMessage.edit(intermission);
				});
		});

		function createCar(currentCar) {
            const car = require(`./cars/${currentCar.carFile}`);
			const rarity = rarityCheck(car);
			let make = car["make"];
			if (typeof make === "object") {
				make = car["make"][0];
			}

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

		async function randomize() {
			trackset = tracksets[Math.floor(Math.random() * tracksets.length)];
			let offroad = Math.floor(Math.random() * 2);
			console.log(offroad);
			switch (offroad) {
				case 0:
					while ((trackset.includes("(muddy)") || trackset.includes("(dirt)") || trackset.includes("(gravel)") || trackset.includes("(rainy gravel)") || trackset.includes("(snowy)") || trackset.includes("(ice)")) === false) { //off-road
						trackset = tracksets[Math.floor(Math.random() * tracksets.length)];
					}
					break;
				case 1:
					while (trackset.includes("(muddy)") || trackset.includes("(dirt)") || trackset.includes("(gravel)") || trackset.includes("(rainy gravel)") || trackset.includes("(snowy)") || trackset.includes("(ice)")) { //on-road
						trackset = tracksets[Math.floor(Math.random() * tracksets.length)];
					}
					break;
				default:
					break;
			}
			playerData.rrTrackset = trackset;
			
			let opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
		    let hmm = require(`./cars/${opponentCarFile}`);
			let criteria = {};

			while (smartGen(hmm) === true) {
				opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
				hmm = require(`./cars/${opponentCarFile}`);
			}
			if (playerData.rrWinStreak > 75 && playerData.rrWinStreak <= 100) {
				criteria = { rq: hmm["rq"] + Math.floor(Math.random() * 6) + 5 };
			}
			else if (playerData.rrWinStreak > 100 && playerData.rrWinStreak <= 125) {
				criteria = { rq: hmm["rq"] + Math.floor(Math.random() * 6) + 5 };
				let reqs = ["tyreType", "driveType", "enginePos"];
				let req = reqs[Math.floor(Math.random() * reqs.length)];
				let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
				if (reqCar[req].toLowerCase() === "Mixed") {
					reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
				}
				criteria[req] = reqCar[req];
			}
			else if (playerData.rrWinStreak > 125 && playerData.rrWinStreak <= 175) {
				criteria = { rq: hmm["rq"] + Math.floor(Math.random() * 6) };
				let reqs = ["modelYear", "seatCount", "bodyStyle"];
				let req = reqs[Math.floor(Math.random() * reqs.length)];

				switch (req) {
					case "bodyStyle":
					case "seatCount":
						let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						criteria[req] = reqCar[req];
						break;
					case "modelYear":
						let myStart = 1960 + (Math.floor(Math.random() * 6) * 10);
						criteria[req] = { start: myStart, end: myStart + 10 }
						break;
					default:
						break;
				}
			}
			else if (playerData.rrWinStreak > 175) {
				criteria = { rq: hmm["rq"] + Math.floor(Math.random() * 6) };
				let reqs = ["make", "modelYear", "gc", "tags"];
				let req = reqs[Math.floor(Math.random() * reqs.length)];

				switch (req) {
					case "make":
					case "gc":
					case "tags":
						let reqCar = require(`./cars/${carFiles[Math.floor(Math.random() * carFiles.length)]}`);
						if (Array.isArray(reqCar[req])) {
							criteria[req] = reqCar[req][0];
						}
						else {
							criteria[req] = reqCar[req];
						}
						break;
					case "modelYear":
						let myStart = 1960 + (Math.floor(Math.random() * 12) * 5);
						criteria[req] = { start: myStart, end: myStart + 5 }
						break;
					default:
						break;
				}
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
			playerData.rrReqs = criteria;
			await db.set(`acc${message.author.id}`, playerData);
		}

		function smartGen(car) {
			if (playerData.rrWinStreak <= 5) {
				return car["isPrize"] === true || car["rq"] > 49;
			}
			else if (playerData.rrWinStreak > 5 && playerData.rrWinStreak <= 15) {
				return car["isPrize"] === true || car["rq"] < 20 || car["rq"] > 64;
			}
			else if (playerData.rrWinStreak > 15 && playerData.rrWinStreak <= 30) {
				return car["isPrize"] === true || car["rq"] < 30 || car["rq"] > 64;
			}
			else if (playerData.rrWinStreak > 30 && playerData.rrWinStreak <= 50) {
				return car["isPrize"] === true || car["rq"] < 40 || car["rq"] > 79;
			}
			else if (playerData.rrWinStreak > 50 && playerData.rrWinStreak <= 75) {
				return car["isPrize"] === true || car["rq"] < 50;
			}
			else if (playerData.rrWinStreak > 75 && playerData.rrWinStreak <= 125) {
				return car["rq"] < 50;
			}
			else if (playerData.rrWinStreak > 125 && playerData.rrWinStreak <= 175) {
				return car["rq"] < 65;
			}
			else {
				return car["rq"] < 80;
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