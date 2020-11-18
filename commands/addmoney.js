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
    name: "addmoney",
    usage: "<username> <amount here>",
    args: true,
    adminOnly: true,
    description: "Adds a certain amount of money to someone's cash balance.",
    async execute(message, args) {
		const db = message.client.db;
        const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
        var userName = args[0].toLowerCase();
        var user, member;
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
                .setDescription("Correct syntax: `cd-addmoney <username> <amount here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (isNaN(amount) || parseInt(amount) < 1) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, money amount provided is either not a number or less than 1.")
                .setDescription("The amount of money you want to add should always be a positive number, i.e: `4`, `20`, etc.")
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

        playerData.money += parseInt(amount);
		await db.set(`acc${user.id}`, playerData);

        const infoScreen = new Discord.MessageEmbed()
            .setColor('#03fc24')
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully added ${moneyEmoji}${amount} to ${member.displayName}'s cash balance!`)
			.setDescription(`Current Money Balance: ${moneyEmoji}${playerData.money}`)
            .setTimestamp();
        return message.channel.send(infoScreen);
    }
}