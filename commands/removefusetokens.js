const Discord = require("discord.js-light");

module.exports = {
    name: "removefusetokens",
	aliases: ["rmvfusetokens"],
    usage: "<username> <amount here>",
    args: true,
    adminOnly: true,
    description: "Removes a certain amount of fuse tokens from someone.",
    async execute(message, args) {
		const db = message.client.db;
        const fuseEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "fuse");
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
                .setDescription("Correct syntax: `cd-removefusetokens <username> <amount here>`")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (isNaN(amount)) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, fuse token amount provided is not a number.")
                .setDescription("The amount of fuse tokens you want to remove should always be a number, i.e: `133`, `7`, etc.")
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

        await db.subtract(`acc${user.id}.fuseTokens`, parseInt(amount));
		const currentFuseTokens = await db.get(`acc${user.id}.fuseTokens`);
        console.log(currentFuseTokens);

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#03fc24")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully removed ${fuseEmoji}${amount} from ${member.displayName}'s fuse token balance!`)
			.setDescription(`Current Fuse Token Balance: ${fuseEmoji}${currentFuseTokens}`)
            .setTimestamp();
        return message.channel.send(infoScreen);
    }
}