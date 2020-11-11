const Discord = require("discord.js-light");
const moment = require("moment");

module.exports = {
	name: "daily",
	usage: "(no arguments required)",
	args: false,
	adminOnly: false,
	description: "Collect your daily reward with this command!",
	async execute(message) {
		const db = message.client.db;
		const playerData = await db.get(`acc${message.author.id}`);
		const reward = 7500;
		var lastDaily = playerData.lastDaily;
		if (!lastDaily) {
			lastDaily = moment(new Date(2020, 1, 1, 0, 0, 0));
		}
		const timeLeft = moment(lastDaily).add(1, "days");
		console.log(moment().diff(timeLeft, "seconds"));

		if (moment().diff(timeLeft, "seconds") > 0) {
			playerData.lastDaily = moment();
			playerData.money += reward;
			await db.set(`acc${message.author.id}`, playerData);

			const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle(`You've received your daily reward of ${moneyEmoji}${reward}!`)
				.addField("Current Money Balance", `${moneyEmoji}${playerData.money}`)
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