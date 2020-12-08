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
	name: "daily",
	usage: "(no arguments required)",
	args: 0,
	adminOnly: false,
	description: "Collect your daily reward with this command!",
	async execute(message) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const moneyReward = 7500;
		const fuseReward = 100;
		var lastDaily = playerData.lastDaily;
		if (!lastDaily) {
			lastDaily = moment(new Date(2020, 1, 1, 0, 0, 0));
		}
		const timeLeft = moment(lastDaily).add(1, "days");

		if (moment().diff(timeLeft, "seconds") > 0) {
			playerData.lastDaily = moment();
			playerData.money += moneyReward;
			playerData.fuseTokens += fuseReward;
			await db.set(`acc${message.author.id}`, playerData);

			const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
       		const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`You've received your daily reward of ${moneyEmoji}${moneyReward} and ${fuseEmoji}${fuseReward}!`)
				.addField("Current Money Balance", `${moneyEmoji}${playerData.money}`, true)
				.addField("Current Fuse Token Balance", `${fuseEmoji}${playerData.fuseTokens}`, true)
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
		else {
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("You've already received your daily reward!")
				.setDescription(`Come back in ${moment().to(timeLeft, true)}!`)
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
	}
}