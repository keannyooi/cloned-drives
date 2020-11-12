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
    name: "removemoney",
	aliases: ["rmvmoney"],
    usage: "<username> <amount here>",
    args: true,
    adminOnly: true,
    description: "Removes a certain amount of money from someone.",
    async execute(message, args) {
		const db = message.client.db;
        const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
        var userName = args[0].toLowerCase();
        var user;
        message.guild.members.cache.forEach(User => {
            if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                console.log("found!");
                user = User.user;
				member = message.guild.member(User);
            }
        });
        const amount = args[1];
        if (!amount) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, arguments provided insufficient.")
                .setDescription("Correct syntax: `cd-removemoney <username> <amount here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (isNaN(amount)) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, money amount provided is not a number.")
                .setDescription("The amount of money you want to remove should always be a number, i.e: `133`, `7`, etc.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
		else if (parseInt(amount) < 1) {
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, money amount provided is less than or equal to 0.")
                .setDescription("The amount of money you want to remove should always be bigger than 0.")
                .setTimestamp();
            return message.channel.send(errorMessage);
		}

        if (!user) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, 404 user not found.")
                .setDescription("It looks like this user isn't in this server.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (user.bot) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, user requested is a bot.")
                .setDescription("Bots can't play Cloned Drives.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
		const playerData = await db.get(`acc${user.id}`);

		if (parseInt(amount) < playerData.money) {
			playerData.money -= parseInt(amount);
			await db.set(`acc${user.id}`, playerData);

        	const infoScreen = new Discord.MessageEmbed()
            	.setColor('#03fc24')
            	.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            	.setTitle(`Successfully removed ${moneyEmoji}${amount} from ${member.displayName}'s cash balance!`)
				.setDescription(`Current Money Balance: ${moneyEmoji}${playerData.money}`)
            	.setTimestamp();
        	return message.channel.send(infoScreen);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, a user's balance cannot be in the negatives.")
                .setDescription("The amount of money that can be taken away should not be bigger than the user's money balance")
				.addFields(
					{ name: `${member.displayName}'s Money Balance`, value: `${moneyEmoji}${playerData.money}`, inline: true },
					{ name: "Amount You Are Tyring to Take Away", value: `${moneyEmoji}${parseInt(amount)}`, inline: true }
				)
                .setTimestamp();
            return message.channel.send(errorMessage);
		}
    }
}