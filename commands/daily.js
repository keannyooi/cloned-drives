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
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));

module.exports = {
	name: "daily",
	usage: "(no arguments required)",
	args: 0,
	isExternal: true,
	adminOnly: false,
	description: "Collect your daily reward with this command!",
	async execute(message) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		let streak = playerData.dailyStreak || 0;

		let lastDaily = playerData.lastDaily;
		if (!lastDaily || !isNaN(lastDaily)) {
			lastDaily = DateTime.fromISO("2021-01-01");
		}
		else {
			lastDaily = DateTime.fromISO(lastDaily);
		}
		const interval = Interval.fromDateTimes(DateTime.now(), lastDaily.plus({ days: 1 }))

		if (interval.invalid !== null) {
			const openPackCommand = require("./sharedfiles/openpack.js");
			const streakCheck = Interval.fromDateTimes(lastDaily.plus({ days: 1 }), DateTime.now());
			let desc = " ", image;
			if (streakCheck.length("days") > 1) {
				streak = 1;
			}
			else {
				streak++;
			}

			if (streak % 20 === 0) {
				let randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
				while (!randomPack.includes("elite")) {
					randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
				}
				let currentPack = require(`./packs/${randomPack}`);
				let addedCars = openPackCommand.openPack(message, currentPack);

				for (i = 0; i < addedCars.length; i++) {
					let isInGarage = playerData.garage.findIndex(garageCar => {
						return garageCar.carFile === addedCars[i];
					});
					if (isInGarage !== -1) {
						playerData.garage[isInGarage]["000"] += 1;
					}
					else {
						playerData.garage.push({
							carFile: addedCars[i],
							"000": 1,
							"333": 0,
							"666": 0,
							"996": 0,
							"969": 0,
							"699": 0,
						});
					}
				}
				desc = " and you've received a free random elite pack as a bonus!";
				image = currentPack["pack"];
			}
			else if (streak % 7 === 0) {
				let randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
				while (randomPack.includes("elite") || randomPack.includes("booster")) {
					randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
				}
				let currentPack = require(`./packs/${randomPack}`);
				let addedCars = openPackCommand.openPack(message, currentPack);

				for (i = 0; i < addedCars.length; i++) {
					let isInGarage = playerData.garage.findIndex(garageCar => {
						return garageCar.carFile === addedCars[i];
					});
					if (isInGarage !== -1) {
						playerData.garage[isInGarage]["000"] += 1;
					}
					else {
						playerData.garage.push({
							carFile: addedCars[i],
							"000": 1,
							"333": 0,
							"666": 0,
							"996": 0,
							"969": 0,
							"699": 0,
						});
					}
				}
				desc = " and you've received a free random pack as a bonus!";
				image = currentPack["pack"];
			}
			else if (streak % 5 === 0) {
				let randomCar = carFiles[Math.floor(Math.random() * carFiles.length)];
				let hmm = require(`./cars/${randomCar}`);
				while (hmm["rq"] > 64) {
					randomCar = carFiles[Math.floor(Math.random() * carFiles.length)];
					hmm = require(`./cars/${randomCar}`);
				}

				let isInGarage = playerData.garage.findIndex(garageCar => {
					return garageCar.carFile === randomCar;
				});
				if (isInGarage !== -1) {
					playerData.garage[isInGarage]["000"] += 1;
				}
				else {
					playerData.garage.push({
						carFile: randomCar,
						"000": 1,
						"333": 0,
						"666": 0,
						"996": 0,
						"969": 0,
						"699": 0,
					});
				}

				let make = hmm["make"];
				if (typeof make === "object") {
					make = hmm["make"][0];
				}
				desc = ` and you've received a free ${make} ${hmm["model"]} (${hmm["modelYear"]}) as a bonus!`;
				image = hmm["card"];
			}

			const moneyReward = 7500 + ((streak - 1) * 4000);
			const fuseReward = 300 * streak;
			playerData.lastDaily = DateTime.now().toISO();
			playerData.money += moneyReward;
			playerData.fuseTokens += fuseReward;
			playerData.dailyStreak = streak;
			await db.set(`acc${message.author.id}`, playerData);

			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
       		const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			let infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`You've received your daily reward of ${moneyEmoji}${moneyReward} and ${fuseEmoji}${fuseReward}!`)
				.setDescription(`Current Streak: \`${streak}\`${desc}`)
				.addField("Current Money Balance", `${moneyEmoji}${playerData.money}`, true)
				.addField("Current Fuse Token Balance", `${fuseEmoji}${playerData.fuseTokens}`, true)
				.setTimestamp();
			if (desc !== " ") {
				infoScreen.setImage(image);
			}
			return message.channel.send(infoScreen);
		}
		else {
			let hours = Math.floor(interval.length("hours"));
			let minutes = Math.floor(interval.length("minutes") - (hours * 60));
			let seconds = Math.floor(interval.length("seconds") - (hours * 3600) - (minutes * 60));
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("You've already received your daily reward!")
				.setDescription(`Come back in \`${hours}h ${minutes}m ${seconds}s\`!`)
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
	}
}