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
    name: "setwinstreak",
    usage: "<username> | <amount>",
    args: 2,
	isExternal: false,
    adminOnly: true,
    description: "Sets a player's win streak to a certain number.",
    async execute(message, args) {
        const db = message.client.db;

        var user, member;
        if (args.length) {
            var userName = args[0].toLowerCase();

            message.guild.members.cache.forEach(User => {
                if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                    console.log("found!");
                    user = User.user;
                    member = message.guild.member(User);
                }
            });
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

		if (isNaN(args[1]) || parseInt(args[1]) < 0) {
			const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, win streak requested is either not a number or inapplicable.")
                .setDescription("Win streaks should be a number bigger or equal to 0.")
                .setTimestamp();
            return message.channel.send(errorMessage);
		}

		await db.set(`acc${user.id}.rrWinStreak`, parseInt(args[1]));
		const infoScreen = new Discord.MessageEmbed()
            .setColor("#03fc24")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully set ${member.displayName}'s win streak to ${args[1]}!`)
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setTimestamp();
		return message.channel.send(infoScreen);
    }
}