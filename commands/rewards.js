/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const moment = require("moment");

module.exports = {
	name: "rewards",
	usage: "(no arguments required)",
	args: false,
	adminOnly: false,
	description: "Collect your race rewards with this command!",
	async execute(message) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const rewards = playerData.unclaimedRewards;

		if (rewards.money === 0 && rewards.fuseTokens === 0 && rewards.trophies === 0 && rewards.cars.length === 0) {
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("It looks like you don't have any unclaimed rewards.")
				.setDescription("Come back when you have pending rewards!")
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
		else {
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`Successfully claimed your rewards!`)
				.setTimestamp();
			
			if (rewards.money > 0) {
				const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
				playerData.money += rewards.money;
				infoScreen.addField("Claimed Money", `${moneyEmoji}${rewards.money}`, true);
				rewards.money = 0;
			}
			if (rewards.fuseTokens > 0) {
				const fuseEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "fuse");
				playerData.fuseTokens += rewards.fuseTokens;
				infoScreen.addField("Claimed Fuse Tokens", `${fuseEmoji}${rewards.fuseTokens}`, true);
				rewards.fuseTokens = 0;
			}
			if (rewards.trophies > 0) {
				const trophyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "trophies");
				playerData.trophies += rewards.trophies;
				infoScreen.addField("Claimed Trophies", `${trophyEmoji}${rewards.trophies}`, true);
				rewards.trophies = 0;
			}
			if (rewards.cars.length > 0) {
				var carList = "";
				for (i = 0; i < rewards.cars.length; i++) {
					playerData.garage.push({ carFile: rewards.cars[i], gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });

					const currentCar = require(`./cars/${rewards.cars[i]}`);
					const rarity = rarityCheck(currentCar);
					carList += `(${rarity} ${currentCar["rq"]}) ${currentCar["make"]} ${currentCar["model"]} (${currentCar["modelYear"]})\n`
				}
				infoScreen.addField("Claimed Cars", carList);
				rewards.cars = [];
			}

			await db.set(`acc${message.author.id}`, playerData);
			return message.channel.send(infoScreen);
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