/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const Canvas = require("canvas");
const { DateTime, Interval } = require("luxon");

module.exports = {
	name: "challenge",
	usage: "(optional) <round>",
	args: 0,
	isExternal: true,
	adminOnly: false,
	description: "Views the current ongoing challenge.",
	async execute(message, args) {
		const db = message.client.db;
		const challenge = await db.get("challenge");
		const filter = (reaction, user) => {
			return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
		};

		console.log(challenge.roster);
		if (challenge.isActive || message.member.roles.cache.has("802043346951340064")) {
			let displayRound = challenge.players[`acc${message.author.id}`] || 0;
			if (!isNaN(args[0])) {
				displayRound = Math.ceil(parseInt(args[0]));
				if (displayRound < 1 || displayRound > challenge.roster.length) {
					message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
					const errorScreen = new Discord.MessageEmbed()
						.setColor("#fc0303")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("Error, page number requested invalid.")
						.setDescription(`The challenge only has a total of ${challenge.roster.length} rounds.`)
						.addField("Page Number Received", `\`${displayRound}\` (not within the range of \`1\` and \`${challenge.roster.length}\`)`)
						.setTimestamp();
					return message.channel.send(errorScreen);
				}
				displayRound--;
			}
			else if (displayRound === challenge.roster.length) {
				displayRound--;
			}
			var reactionIndex = 0;
			let lists = clDisplay(displayRound);
			let intervalString = "";
			let interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline));

			if (challenge.isActive === true && interval.invalid === null) {
				let days = Math.floor(interval.length("days"));
				let hours = Math.floor(interval.length("hours") - (days * 24));
				let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
				let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
				intervalString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
			}
			else if (challenge.isActive === false || challenge.timeLeft === "unlimited") {
				intervalString = "unlimited";
			}
			else {
				intervalString = "currently ending, no longer playable";
			}

			let infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`${challenge.name} (Round ${displayRound + 1} of ${challenge.roster.length})`)
				.setDescription(`This challenge's active status: \`${challenge.isActive}\`
				Time Left: \`${intervalString}\``)
				.addFields(
					{ name: "Hand", value: lists.handString, inline: true },
					{ name: "Tracksets", value: lists.trackString, inline: true },
					{ name: "Requirements", value: lists.reqString, inline: true },
					{ name: "Rewards", value: lists.rewardString, inline: true }
				)
				.setTimestamp();
			if (message.channel.type === "text") {
				infoScreen.setFooter(`React with ⬅️ or ➡️ to navigate through pages.`);
			}
			else {
				infoScreen.setFooter(`Arrow navigation is disabled in DMs, please use cd-challenge <round number> to view a different round.`);
			}

			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			let clMessage = await message.channel.send(infoScreen);

			if (message.channel.type === "text") {
				switch (reactionIndex) {
					case 0:
						break;
					case 1:
						clMessage.react("➡️");
						break;
					case 2:
						clMessage.react("⬅️");
						break;
					case 3:
						clMessage.react("⬅️");
						clMessage.react("➡️");
						break;
					default:
						break;
				}

				const collector = clMessage.createReactionCollector(filter, { time: 60000 });
				collector.on("collect", reaction => {
					if (reaction.emoji.name === "⬅️") {
						displayRound -= 1;
					}
					else if (reaction.emoji.name === "➡️") {
						displayRound += 1;
					}
					lists = clDisplay(displayRound);
					clMessage.reactions.removeAll();

					interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline));
					if (challenge.isActive === true && interval.invalid === null) {
						let days = Math.floor(interval.length("days"));
						let hours = Math.floor(interval.length("hours") - (days * 24));
						let minutes = Math.floor(interval.length("minutes") - (days * 1440) - (hours * 60));
						let seconds = Math.floor(interval.length("seconds") - (days * 86400) - (hours * 3600) - (minutes * 60));
						intervalString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
					}
					else if (challenge.isActive === false || challenge.timeLeft === "unlimited") {
						intervalString = "unlimited";
					}
					else {
						intervalString = "currently ending, no longer playable";
					}

					infoScreen = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle(`${challenge.name} (Round ${displayRound + 1} of ${challenge.roster.length})`)
						.setDescription(`This challenge's active status: \`${challenge.isActive}\`
						Time Left: \`${intervalString}\``)
						.addFields(
							{ name: "Hand", value: lists.handString, inline: true },
							{ name: "Tracksets", value: lists.trackString, inline: true },
							{ name: "Requirements", value: lists.reqString, inline: true },
							{ name: "Rewards", value: lists.rewardString, inline: true }
						)
						.setTimestamp();
					clMessage.edit(infoScreen);

					switch (reactionIndex) {
						case 0:
							break;
						case 1:
							clMessage.react("➡️");
							break;
						case 2:
							clMessage.react("⬅️");
							break;
						case 3:
							clMessage.react("⬅️");
							clMessage.react("➡️");
							break;
						default:
							break;
					}
				});

				collector.on("end", () => {
					console.log("end of collection");
					clMessage.reactions.removeAll();
				});
			}
		}
		else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("There is no challenge live right now.")
				.setDescription("Please check back later.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}

		function clDisplay(displayRound) {
			if (challenge.roster.length === 1) {
				reactionIndex = 0;
			}
			else if (displayRound === 0) {
				reactionIndex = 1;
			}
			else if (displayRound >= challenge.roster.length - 1) {
				reactionIndex = 2;
			}
			else {
				reactionIndex = 3;
			}
			let handString = "", trackString = "", reqString = "", rewardString = "";

			for (let i = 0; i < 5; i++) {
				let car = require(`./cars/${challenge.roster[displayRound].hand[i]}`);
				let track = require(`./tracksets/${challenge.roster[displayRound].tracksets[i]}`);
				let make = car["make"];
				let rarity = rarityCheck(car);
				if (typeof make === "object") {
					make = car["make"][0];
				}

				handString += `${i + 1} - (${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${challenge.roster[displayRound].tunes[i]}]\n`;
				trackString += `${i + 1} - ${track.trackName}\n`;
			}

			for (let i = 0; i < challenge.roster[displayRound].requirements.length; i++) {
				let key = Object.keys(challenge.roster[displayRound].requirements[i])[0];
				console.log(key);
				switch (typeof challenge.roster[displayRound].requirements[i][key]) {
					case "object":
						let prefix = "", suffix = "";
						switch (key) {
							case "rq":
								prefix = "RQ";
								break;
							case "seatCount":
								suffix = " seats";
								break;
							default:
								break;
						}
						reqString += `\`${challenge.roster[displayRound].requirements[i].amount}x ${prefix}${challenge.roster[displayRound].requirements[i][key].start} - ${challenge.roster[displayRound].requirements[i][key].end}${suffix}\`, `;
						break;
					case "boolean":
					case "string":
						if (key === "car") {
							let reqCar = require(`./cars/${challenge.roster[displayRound].requirements[i][key]}`);
							let reqMake = reqCar["make"];
							if (typeof reqMake === "object") {
								reqMake = reqCar["make"][0];
							}
							reqString += `\`${challenge.roster[displayRound].requirements[i].amount}x ${reqMake} ${reqCar["model"]} (${reqCar["modelYear"]})\`, `;
						}
						else {
							let suffix = "";
							switch (key) {
								case "tyreType":
									suffix = " tyres";
									break;
								case "enginePos":
									suffix = " engined";
									break;
								case "fuelType":
									suffix = " powered";
									break;
								case "gc":
									suffix = " gc";
									break;
								case "isPrize":
									suffix = " non-prize";
									break;
								default:
									break;
							}

							reqString += `\`${challenge.roster[displayRound].requirements[i].amount}x ${challenge.roster[displayRound].requirements[i][key]}${suffix}\`, `;
						}
						break;
					default:
						break;
				}
			}
			if (reqString === "") {
				if (challenge.roster[displayRound].rqLimit === "None") {
					reqString = "Open Match";
				}
				else {
					reqString = `**RQ Limit:** ${challenge.roster[displayRound].rqLimit}`;
				}
			}
			else {
				reqString = reqString.slice(0, -2);
				if (challenge.roster[displayRound].rqLimit !== "None") {
					reqString += `\n**RQ Limit:** ${challenge.roster[displayRound].rqLimit}`;
				}
			}

			for (let [key, value] of Object.entries(challenge.roster[displayRound].rewards)) {
				switch (key) {
					case "money":
						emoji = message.client.emojis.cache.get("726017235826770021");
						rewardString = `${emoji}${value}`;
						break;
					case "fuseTokens":
						emoji = message.client.emojis.cache.get("726018658635218955");
						rewardString = `${emoji}${value}`;
						break;
					case "car":
						let car = require(`./cars/${challenge.roster[displayRound].rewards.car}`);
						let rarity = rarityCheck(car);
						let make2 = car["make"];
						if (typeof make2 === "object") {
							make2 = car["make"][0];
						}
						rewardString = `(${rarity} ${car["rq"]}) ${make2} ${car["model"]} (${car["modelYear"]})`;
						break;
					case "pack":
						let pack = require(`./packs/${challenge.roster[displayRound].rewards.pack}`);
						rewardString = pack["packName"];
						break;
					default:
						break;
				}
			}
			if (challenge.roster[displayRound].rewards.trophies) {
				emoji = message.client.emojis.cache.get("775636479145148418");
				if (rewardString === "") {
					rewardString = `${emoji}${challenge.roster[displayRound].rewards.trophies}`;
				}
				else {
					rewardString += `, ${emoji}${challenge.roster[displayRound].rewards.trophies}`;
				}
			}
			if (rewardString === "") {
				rewardString = "None";
			}

			return { handString: handString, trackString: trackString, reqString: reqString, rewardString: rewardString };
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