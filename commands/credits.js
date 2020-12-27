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
    name: "credits",
    usage: "<no arguments here>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "A list of everyone that participated in the making of this server.",
    execute(message) {
        const credits = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle("Cloned Drives Credits")
            .setDescription("Created by keanny and many more.")
            .addFields(
                { name: "Original Server Creator", value: "Macan94126", inline: true },
                { name: "Head Developer (& the dude who did most of the work)", value: "keanny", inline: true },
                { name: "Vice Head Developer", value: "DodgeDemon", inline: true },
                { name: "Card Creators", value: "keanny, Macan94126, andugandu, DodgeDemon, Olimato, havvy", inline: true },
                { name: "Racehud Creators", value: "keanny, Macan94126, andugandu, Olimato", inline: true },
                { name: "Curators", value: "keanny, Macan94126, andugandu, havvy, Olimato, DodgeDemon", inline: true },
                { name: "Media Management", value: "keanny", inline: true },
                { name: "Cool Dudes List", value: "Cjiir, Ploosh, RWB_964, gandu", inline: true },
                { name: "Dedicated To:", value: "Every Top Drives player (and you)", inline: true },
                { name: "Main Sources", value: "Car & Driver, Motortrend, Road & Track, autoevolution.com, automobilecatalog.com", inline: true },
            )
            .setTimestamp();
        return message.channel.send(credits);
    }
}