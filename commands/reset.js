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
    name: "reset",
    aliases: ["rs"],
    usage: "<username>",
    args: 1,
	isExternal: false,
    adminOnly: true,
    description: "Resets someone's stats.",
    async execute(message, args) {
		const starterCars = ["abarth 124 spider (2017).json", "range rover classic 5-door (1984).json", "honda prelude type sh (1997).json", "chevrolet impala ss 427 (1967).json", "volkswagen beetle 2.5 (2012).json"];
		const emojiFilter = (reaction, user) => {
            return (reaction.emoji.name === "✅" || reaction.emoji.name === "❎") && user.id === message.author.id;
        };
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
		
        const confirmationMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Are you sure you want to reset ${user.username}'s data?`)
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setDescription("React with ✅ to proceed or ❎ to cancel.")
            .setTimestamp();

        const reactionMessage = await message.channel.send(confirmationMessage);
        reactionMessage.react("✅");
        reactionMessage.react("❎");
        reactionMessage.awaitReactions(emojiFilter, {
             max: 1,
            time: 10000,
            errors: ['time']
        })
            .then(async collected => {
                reactionMessage.reactions.removeAll();
                switch (collected.first().emoji.name) {
                    case "✅":
                    	await message.client.db.set(`acc${user.id}`, { money: 0, fuseTokens: 0, trophies: 0, garage: [], decks: [], campaignProgress: { chapter: 0, part: 1, race: 1 }, unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [] } });
						var i = 0;
						while (i < 5) {
							var carFile = starterCars[i];
							await message.client.db.push(`acc${user.id}.garage`, { carFile: carFile, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
							i++;
						}
						let infoScreen = new Discord.MessageEmbed()
                            .setColor("#03fc24")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle(`Successfully reset ${member.displayName}'s data!`)
                            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTimestamp();
                	    return reactionMessage.edit(infoScreen);
                    case "❎":
                        reactionMessage.reactions.removeAll();
                        let cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled.")
                            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTimestamp();
                	    return reactionMessage.edit(cancelMessage);
                    default:
                        break;
                }
            })
            .catch(error => {
                console.error(error);
                reactionMessage.reactions.removeAll();
                let cancelMessage = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Action cancelled automatically.")
                    .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTimestamp();
                return reactionMessage.edit(cancelMessage);
            });
    }
}