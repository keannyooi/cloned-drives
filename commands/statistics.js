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
    name: "statistics",
    aliases: ["stats"],
    usage: "(optional) <username>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "Shows someone's stats.",
    async execute(message, args) {
		const db = message.client.db;
        let user, member, displayName;
        if (args.length) {
            let userName = args[0].toLowerCase();

			if (message.channel.type !== "text") {
				const errorMessage = new Discord.MessageEmbed()
                	.setColor("#fc0303")
                	.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                	.setTitle("Error, this feature cannot be executed on DMs.")
                	.setDescription("Due to Discord DM limitations, this feature cannot be executed here. Sorry for your inconvenience.")
                	.setTimestamp();
            	return message.channel.send(errorMessage);
			}
            
            message.guild.members.cache.forEach(User => {
            	if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                	console.log("found!");
                	user = User.user;
					member = message.guild.member(User);
            	}
        	});
        }
        else {
            user = message.author;
			member = message.member;
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

		if (message.channel.type === "text") {
			displayName = member.displayName;
		}
		else {
			displayName = user.username;
		}
        
		const userData = await db.get(`acc${user.id}`);
		console.log(userData);
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
        const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
		const garage = userData.garage;

		if (userData.money === null) {
			userData.money = 0;
		}
		if (userData.fuseTokens === null) {
			userData.fuseTokens = 0;
		}
		if (userData.trophies === null) {
			userData.trophies = 0;
		}

		let totalCars = 0, maxedCarAmount = 0;
        for (i = 0; i < garage.length; i++) {
			totalCars += (garage[i]["000"] + garage[i]["333"] + garage[i]["666"] + garage[i]["996"] + garage[i]["969"] + garage[i]["699"]);
            maxedCarAmount += (garage[i]["996"] + garage[i]["969"] + garage[i]["699"]);
        }
        const MCpercentage = maxedCarAmount / totalCars * 100;

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Stats of ${displayName}`)
            .setDescription(`Account created in ${moment(user.createdAt).format("MMMM Do YYYY, h:mm:ss a")}`)
            .addFields(
                { name: "Money Balance", value: `${moneyEmoji}${userData.money}`, inline: true },
                { name: "Fuse Tokens", value: `${fuseEmoji}${userData.fuseTokens}`, inline: true },
                { name: "Trophies", value: `${trophyEmoji}${userData.trophies}`, inline: true },
                { name: "Total Cars in Garage", value: totalCars, inline: true },
                { name: "Total Maxed Cars in Garage", value: maxedCarAmount, inline: true },
                { name: "Maxed Car Percentage", value: `${MCpercentage.toFixed(2)}%`, inline: true },
            )
            .setTimestamp();
        return message.channel.send(infoScreen);
    }
}